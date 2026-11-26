import type { FastifyBaseLogger } from 'fastify';
import { redis } from '../cache.js';
import { config } from '../config.js';
import { dbContext, fromProfile, ingestOne, recomputeStored, summaryOf, thresholdsOf } from '../activityStore.js';
import { syncTargets, type SyncTarget } from '../db/repo.js';
import { sourceFor, type AthleteSource } from '../sources.js';
import { isoDay } from '../lib/summary.js';

/**
 * Rattrapage des sorties de l'app, toutes les 30 min :
 *  1. si aucune sortie n'est en base sur 90 jours (premier passage, compte
 *     ancien), copie des résumés des 90 derniers jours (une requête, au plus
 *     4 fois par jour) ;
 *  2. récupération des courbes manquantes, au plus 10 par athlète et par jour
 *     (quota Intervals.icu : 100 requêtes/jour en OAuth), des plus récentes aux
 *     plus anciennes ;
 *  3. recalcul des sorties dont la FTP ou la FC seuil de la fiche a changé
 *     (aucun appel à Intervals.icu).
 * Désactivé en démo.
 */

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 30 * 60 * 1000;
const FIRST_RUN_MS = 60_000;
const LOCK_KEY = 'lock:backfill';
const LOCK_TTL_S = 25 * 60;
const WINDOW_DAYS = 90;
/** Courbes récupérées par athlète et par jour au plus. */
export const DAILY_STREAMS = 10;
/** Le compteur journalier survit à la journée et un peu plus (36 h). */
const BUDGET_TTL_S = 36 * 60 * 60;
/** Copie des résumés sur 90 jours : au plus une fois toutes les 6 h par athlète. */
const WINDOW_TTL_S = 6 * 60 * 60;

/**
 * Réserve une récupération de courbes pour ce jour. SET NX et INCR dans une
 * même transaction Redis : le compteur ne peut pas rester sans TTL.
 * Redis indisponible → refus (pas de quota connu, donc pas d'appel).
 */
export async function takeStreamBudget(userId: string, day: string): Promise<boolean> {
  const key = `backfill:${userId}:${day}`;
  try {
    const res = await redis.multi().set(key, '0', 'EX', BUDGET_TTL_S, 'NX').incr(key).exec();
    const count = Number(res?.[1]?.[1] ?? Number.POSITIVE_INFINITY);
    return count <= DAILY_STREAMS;
  } catch {
    return false;
  }
}

/** Un passage de rattrapage pour un athlète connecté. */
export async function backfillAthlete(
  target: SyncTarget,
  source: AthleteSource,
  log: FastifyBaseLogger,
  now = new Date(),
): Promise<{ summaries: number; streams: number; recomputed: number }> {
  const ctx = dbContext(target.id);
  const id = target.intervals_athlete_id;
  const from = isoDay(new Date(now.getTime() - WINDOW_DAYS * DAY));
  let summaries = 0;

  // 1. Compte sans sortie en base sur 90 jours : une lecture des résumés, pas plus d'une fois par fenêtre.
  if ((await ctx.backend.countFrom(from)) === 0 && (await claimWindow(target.id))) {
    const acts = await source.activities(id, from, isoDay(now));
    await ctx.backend.upsert(acts.flatMap(summaryOf));
    summaries = acts.length;
  }

  // 2. Courbes manquantes, dans la limite du jour.
  let streams = 0;
  const pending = await ctx.backend.missing(50);
  if (pending.length > 0) {
    const th = await thresholdsOf(ctx, () => source.athlete(id));
    for (const sid of pending) {
      if (!(await takeStreamBudget(target.id, isoDay(now)))) break;
      const status = await ingestOne(ctx.backend, sid, th, () => source.rawStreams(id, sid), (err) =>
        log.warn({ err, userId: target.id, activityId: sid }, 'rattrapage: courbes non récupérées'),
      );
      if (status === 'stored') streams++;
    }
  }

  // 3. Seuils changés dans la fiche : recalcul depuis les courbes stockées, sans appel.
  let recomputed = 0;
  const profile = await ctx.profile();
  if (profile) recomputed = await recomputeStored(ctx, fromProfile(profile));

  return { summaries, streams, recomputed };
}

/** Vrai une seule fois par fenêtre (SET NX) ; Redis indisponible → non. */
async function claimWindow(userId: string): Promise<boolean> {
  try {
    return (await redis.set(`backfill:window:${userId}`, '1', 'EX', WINDOW_TTL_S, 'NX')) === 'OK';
  } catch {
    return false;
  }
}

/** Démarre le rattrapage périodique (verrou Redis comme la synchro). Désactivé en démo. */
export function startBackfill(log: FastifyBaseLogger): () => void {
  if (config.demoMode) {
    log.info('rattrapage: désactivé en mode démo');
    return () => undefined;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const locked = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_S, 'NX').catch(() => 'OK');
      if (locked !== 'OK') return;
      for (const target of await syncTargets()) {
        try {
          const r = await backfillAthlete(target, await sourceFor(target.intervals_athlete_id), log);
          log.info({ userId: target.id, ...r }, 'rattrapage: passage fait');
        } catch (err) {
          log.warn({ err, userId: target.id }, 'rattrapage: athlète en échec');
        }
      }
    } catch (err) {
      log.error({ err }, 'rattrapage: passage en échec');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  const first = setTimeout(tick, FIRST_RUN_MS);
  first.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
