import type { FastifyBaseLogger } from 'fastify';
import { invalidateKeys, redis } from '../cache.js';
import { recordSync, syncTargetOf } from '../db/repo.js';
import { sourceFor } from '../sources.js';
import { ATHLETE_ID_RE } from '../validation.js';
import { pushNotify, syncAthlete, type Notify } from './sync.js';

/**
 * Webhooks Intervals.icu (page « Manage App ») : `{ secret, events: [{ athlete_id, type, … }] }`.
 *
 *  - Sortie (ACTIVITY_ANALYZED, ou UPLOADED / UPDATED) → synchro de l'athlète
 *    concerné, cache des sorties vidé : le coach est prévenu dans la minute.
 *  - CALENDAR_UPDATED → cache du calendrier vidé.
 *  - SPORT_SETTINGS_UPDATED (FTP, zones) → cache du profil vidé.
 *
 * Le contenu des événements n'est pas utilisé (forme non documentée) : on
 * relit la source, comme la synchro périodique, qui reste le filet de
 * sécurité si un webhook se perd.
 */

type Action = 'sync' | 'calendar' | 'settings';

const ACTIONS: Record<string, Action> = {
  ACTIVITY_ANALYZED: 'sync',
  ACTIVITY_UPLOADED: 'sync',
  ACTIVITY_UPDATED: 'sync',
  CALENDAR_UPDATED: 'calendar',
  SPORT_SETTINGS_UPDATED: 'settings',
};

/**
 * Délai avant synchro. Une sortie tout juste importée n'est analysée (charge,
 * puissance pondérée) qu'environ 60 s plus tard : on l'attend.
 */
const DELAY_MS: Record<string, number> = { ACTIVITY_UPLOADED: 90_000 };
const DEFAULT_DELAY_MS = 5_000;
/** Au plus une synchro en attente par athlète : les événements en rafale sont regroupés. */
const PENDING_TTL = 5 * 60;
const MAX_EVENTS = 100;

export interface WebhookEvent {
  athleteId: string;
  type: string;
}

/** Extrait les événements exploitables, bornés et validés. */
export function parseEvents(body: unknown): WebhookEvent[] {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  return events.slice(0, MAX_EVENTS).flatMap((e: unknown) => {
    const { athlete_id, type } = (e ?? {}) as { athlete_id?: unknown; type?: unknown };
    const athleteId = typeof athlete_id === 'number' ? String(athlete_id) : athlete_id;
    if (typeof athleteId !== 'string' || !ATHLETE_ID_RE.test(athleteId) || typeof type !== 'string' || !(type in ACTIONS)) return [];
    return [{ athleteId, type }];
  });
}

export interface WebhookDeps {
  log: FastifyBaseLogger;
  schedule?: (run: () => Promise<void>, ms: number) => void;
  notify?: Notify;
}

const defaultSchedule = (run: () => Promise<void>, ms: number) => {
  setTimeout(() => void run(), ms).unref();
};

/** Traite les événements reçus ; les synchros partent en différé (la réponse HTTP n'attend pas). */
export async function handleWebhookEvents(events: WebhookEvent[], deps: WebhookDeps): Promise<void> {
  const schedule = deps.schedule ?? defaultSchedule;
  const notify = deps.notify ?? pushNotify(deps.log);

  for (const { athleteId, type } of events) {
    const action = ACTIONS[type];
    if (action === 'calendar') {
      await invalidateKeys(`icu:events:${athleteId}:*`);
    } else if (action === 'settings') {
      await invalidateKeys(`icu:athlete:${athleteId}:*`);
    } else {
      const pendingKey = `webhook:pending:${athleteId}`;
      // Redis indisponible : on synchronise quand même (la base évite les doublons de notification).
      const first = await redis.set(pendingKey, '1', 'EX', PENDING_TTL, 'NX').catch(() => 'OK');
      if (first !== 'OK') continue;
      schedule(async () => {
        await redis.del(pendingKey).catch(() => undefined);
        await syncFromWebhook(athleteId, notify, deps.log);
      }, DELAY_MS[type] ?? DEFAULT_DELAY_MS);
    }
  }
}

async function syncFromWebhook(athleteId: string, notify: Notify, log: FastifyBaseLogger): Promise<void> {
  const target = await syncTargetOf(athleteId).catch(() => null);
  if (!target) return; // athlète inconnu ou déconnecté : rien à faire
  try {
    await invalidateKeys(`icu:activities:${athleteId}:*`);
    const rides = await syncAthlete(target, await sourceFor(athleteId), notify);
    log.info({ userId: target.id, rides }, 'webhook: synchro faite');
  } catch (err) {
    log.warn({ err, userId: target.id }, 'webhook: synchro en échec');
    await recordSync(target.id, err instanceof Error ? err.message : String(err)).catch(() => undefined);
  }
}
