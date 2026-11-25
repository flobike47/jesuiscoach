import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { redis } from '../cache.js';
import { formatDuration, formatKm } from '../lib/format.js';
import { isoDay, summarize } from '../lib/summary.js';
import { activeAlertCodes, coachesOf, markActivitiesSeen, purgeSeenActivities, recordSync, syncTargets, updateActiveAlerts, type SyncTarget } from '../db/repo.js';
import { pushConfigured, sendToUser, type PushPayload } from '../push.js';
import { sourceFor, type AthleteSource } from '../sources.js';
import type { Alert, IntervalsActivity } from '../types.js';

/**
 * Synchro périodique des sorties (toutes les SYNC_INTERVAL_MIN minutes) :
 * chaque sortie jamais vue déclenche une notification aux coachs de
 * l'athlète ; une alerte qui apparaît (fatigue, charge, inactivité) aussi.
 *
 * Budget Intervals.icu (100 requêtes/athlète/jour en OAuth) : une lecture
 * des sorties par passage (48/jour à 30 min), plus forme et calendrier
 * seulement quand une nouvelle sortie arrive.
 * Les webhooks Intervals.icu remplaceront le polling après le spike API.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Fenêtre lue à chaque passage : couvre une sortie synchronisée en retard et l'alerte d'inactivité. */
const WINDOW_DAYS = 8;
/** Alertes qui valent une notification (les séances manquées restent dans l'app). */
const NOTIFIED_ALERTS: ReadonlySet<Alert['code']> = new Set(['fatigue', 'ramp', 'inactive']);
const LOCK_KEY = 'lock:sync';

export type Notify = (userIds: string[], payload: PushPayload) => Promise<void>;

export function rideNotification(athleteName: string, athleteId: string, a: IntervalsActivity): PushPayload {
  const parts = [formatDuration(a.moving_time), formatKm(a.distance)];
  if (a.icu_training_load != null) parts.push(`charge ${a.icu_training_load}`);
  return {
    title: `${athleteName} a terminé ${a.name ?? 'une sortie'}`,
    body: parts.filter((p) => p !== '–').join(' · '),
    url: `athletes/${encodeURIComponent(athleteId)}`,
    tag: `ride-${a.id}`,
  };
}

export function alertNotification(athleteName: string, athleteId: string, alert: Alert): PushPayload {
  return {
    title: `${athleteName} : ${alert.code === 'inactive' ? 'inactif' : 'à surveiller'}`,
    body: alert.text,
    url: `athletes/${encodeURIComponent(athleteId)}`,
    tag: `alert-${athleteId}-${alert.code}`,
  };
}

/** Synchronise un athlète ; renvoie le nombre de nouvelles sorties notifiées. */
export async function syncAthlete(target: SyncTarget, source: AthleteSource, notify: Notify, now = new Date()): Promise<number> {
  const id = target.intervals_athlete_id;
  const today = isoDay(now);
  const activities = await source.activities(id, isoDay(new Date(now.getTime() - WINDOW_DAYS * DAY)), today);
  const fresh = new Set(await markActivitiesSeen(target.id, activities.map((a) => String(a.id))));

  // Première synchro : historique et alertes en cours mémorisés sans rien notifier.
  if (!target.initialized) {
    const inactive = summarize({ id }, [], activities, [], now).alerts.filter((a) => a.code === 'inactive');
    await updateActiveAlerts(target.id, inactive.map((a) => a.code));
    await recordSync(target.id, null);
    return 0;
  }

  const coaches = await coachesOf(target.id);
  const newRides = activities.filter((a) => fresh.has(String(a.id)));
  if (coaches.length) {
    for (const a of newRides) await notify(coaches, rideNotification(target.name, id, a));
  }

  // Alertes : forme et calendrier lus seulement s'il y a du nouveau (quota) ;
  // sinon seule l'inactivité, calculable avec les sorties déjà lues.
  let alerts: Alert[];
  if (newRides.length) {
    const [info, wellness, events] = await Promise.all([
      source.athlete(id),
      source.wellness(id, isoDay(new Date(now.getTime() - 14 * DAY)), today),
      source.events(id, isoDay(new Date(now.getTime() - 7 * DAY)), isoDay(new Date(now.getTime() + 7 * DAY))),
    ]);
    alerts = summarize(info, wellness, activities, events, now).alerts;
  } else {
    alerts = summarize({ id }, [], activities, [], now).alerts.filter((a) => a.code === 'inactive');
  }
  const tracked = alerts.filter((a) => NOTIFIED_ALERTS.has(a.code));
  // Sans nouvelle sortie, on ne sait rien de la fatigue : on ne touche qu'à l'inactivité.
  const appeared = await updateActiveAlertsFor(target.id, tracked, newRides.length > 0);
  if (coaches.length) {
    for (const alert of tracked.filter((a) => appeared.includes(a.code))) {
      await notify(coaches, alertNotification(target.name, id, alert));
    }
  }

  await recordSync(target.id, null);
  return newRides.length;
}

/**
 * Met à jour les alertes actives. Avec `full = false` (pas de nouvelle
 * sortie), les alertes de forme sont conservées telles quelles : seule
 * l'inactivité est réévaluée.
 */
async function updateActiveAlertsFor(userId: string, alerts: Alert[], full: boolean): Promise<string[]> {
  const codes = alerts.map((a) => a.code);
  if (full) return updateActiveAlerts(userId, codes);
  const kept = (await activeAlertCodes(userId)).filter((c) => c !== 'inactive');
  return updateActiveAlerts(userId, [...kept, ...codes]);
}

/** Envoi réel : push vers tous les appareils de chaque coach. */
export function pushNotify(log: FastifyBaseLogger): Notify {
  return async (userIds, payload) => {
    if (!pushConfigured) return;
    for (const userId of userIds) {
      try {
        await sendToUser(userId, payload, log);
      } catch (err) {
        log.warn({ err, userId }, 'sync: notification non envoyée');
      }
    }
  };
}

/** Un passage complet : tous les athlètes connectés, un échec n'arrête pas les autres. */
export async function runSync(log: FastifyBaseLogger, notify: Notify = pushNotify(log)): Promise<{ athletes: number; rides: number }> {
  let rides = 0;
  const targets = await syncTargets();
  for (const target of targets) {
    try {
      rides += await syncAthlete(target, await sourceFor(target.intervals_athlete_id), notify);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ err, userId: target.id }, 'sync: athlète en échec');
      await recordSync(target.id, message).catch(() => undefined);
    }
  }
  await purgeSeenActivities().catch((err) => log.warn({ err }, 'sync: purge échouée'));
  return { athletes: targets.length, rides };
}

/**
 * Démarre la synchro périodique. Verrou Redis : si deux BFF tournaient,
 * un seul passage à la fois (sinon double consommation du quota).
 * Désactivée en mode démo (aucun athlète connecté).
 */
export function startSync(log: FastifyBaseLogger): () => void {
  if (config.demoMode) {
    log.info('sync: désactivée en mode démo');
    return () => undefined;
  }
  const intervalMs = config.syncIntervalMin * 60 * 1000;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const locked = await redis.set(LOCK_KEY, '1', 'EX', Math.max(60, Math.floor(intervalMs / 1000) - 30), 'NX').catch(() => 'OK');
      if (locked !== 'OK') return;
      const { athletes, rides } = await runSync(log);
      log.info({ athletes, rides }, 'sync: passage terminé');
    } catch (err) {
      log.error({ err }, 'sync: passage en échec');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  // Premier passage peu après le démarrage (laisse le serveur s'initialiser).
  const first = setTimeout(tick, 15_000);
  first.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
