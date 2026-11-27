import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { appFitness, storeOf } from '../activityStore.js';
import { fitnessPoints } from '../lib/fitness.js';
import { addSportTimes, timeBySport } from '../lib/sportTime.js';
import { isoDay } from '../lib/summary.js';
import { assertCanView, sourceFor, teamOf } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, Forbidden, HttpError } from '../validation.js';

/**
 * Tendances de l'équipe (coach). Aucune lecture nouvelle chez Intervals.icu :
 * mêmes appels, mêmes fenêtres de dates (donc mêmes clés de cache) que
 * `/team` et la fiche athlète. Limité aux athlètes du coach (`teamOf`).
 */

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (now: Date, n: number) => isoDay(new Date(now.getTime() - n * DAY));
/** Répartition des sports : 4 semaines, aujourd'hui compris (J−27 → J). */
const SPORT_DAYS = 28;

/** Un athlète en erreur (compte déconnecté…) ne bloque pas les autres. */
async function perAthlete<T>(ids: string[], fn: (id: string) => Promise<T>, log: (err: unknown, id: string) => void) {
  const results = await Promise.allSettled(ids.map(fn));
  const ok: T[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') ok.push(r.value);
    else {
      log(r.reason, ids[i]);
      errors.push({ id: ids[i], error: r.reason instanceof HttpError ? r.reason.message : 'Données indisponibles' });
    }
  });
  return { ok, errors };
}

export async function registerTrendRoutes(app: FastifyInstance) {
  /**
   * Fitness de chaque athlète sur 90 jours, côte à côte : une courbe par
   * athlète, jamais de moyenne ni de somme entre athlètes.
   */
  app.get('/team/fitness', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const now = new Date();
    const from = daysAgo(now, 90);
    const to = isoDay(now);
    const { ok, errors } = await perAthlete(
      await teamOf(me),
      async (id) => {
        const src = await sourceFor(id);
        // Mêmes clés de cache que /team : profil (6 h) et wellness J−90 → aujourd'hui (30 min).
        const [info, wellness] = await Promise.all([src.athlete(id), src.wellness(id, from, to)]);
        const store = await storeOf(id, src, now);
        const computed = store ? await appFitness(store, from, to, wellness) : null;
        const series = fitnessPoints(computed?.days ?? null, wellness).map((p) => ({ date: p.date, fitness: p.fitness }));
        return { id, name: info.name ?? id, series };
      },
      (err, id) => req.log.warn({ err, athleteId: id }, 'team/fitness : athlète en erreur'),
    );
    ok.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { from, to, athletes: ok, errors };
  });

  /**
   * Temps par sport sur 4 semaines, pour l'équipe et par athlète. Lit les
   * sorties de /team (fenêtre J−28 → J, même clé de cache) puis garde J−27 → J.
   */
  app.get('/team/sports', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const now = new Date();
    const from = daysAgo(now, SPORT_DAYS - 1);
    const { ok, errors } = await perAthlete(
      await teamOf(me),
      async (id) => {
        const src = await sourceFor(id);
        const [info, activities] = await Promise.all([src.athlete(id), src.activities(id, daysAgo(now, 28), isoDay(now))]);
        return { id, name: info.name ?? id, time: timeBySport(activities, from) };
      },
      (err, id) => req.log.warn({ err, athleteId: id }, 'team/sports : athlète en erreur'),
    );
    ok.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { from, to: isoDay(now), team: addSportTimes(ok.map((a) => a.time)), athletes: ok, errors };
  });

  /** Même répartition pour un athlète (lui-même ou son coach). Fenêtre de la fiche athlète (J−30, même clé de cache). */
  app.get<{ Params: { id: string } }>('/athletes/:id/sports', async (req) => {
    const me = requireUser(req);
    const id = req.params.id;
    if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
    await assertCanView(me, id);
    const now = new Date();
    const from = daysAgo(now, SPORT_DAYS - 1);
    const src = await sourceFor(id);
    const activities = await src.activities(id, daysAgo(now, 30), isoDay(now));
    return { from, to: isoDay(now), time: timeBySport(activities, from) };
  });
}
