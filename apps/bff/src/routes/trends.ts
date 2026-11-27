import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { appFitness, storeOf } from '../activityStore.js';
import { fitnessPoints } from '../lib/fitness.js';
import { isoDay } from '../lib/summary.js';
import { sourceFor, teamOf } from '../sources.js';
import { Forbidden, HttpError } from '../validation.js';

/**
 * Tendances de l'équipe (coach). Aucune lecture nouvelle chez Intervals.icu :
 * mêmes appels, mêmes fenêtres de dates (donc mêmes clés de cache) que
 * `/team` et la fiche athlète. Limité aux athlètes du coach (`teamOf`).
 */

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (now: Date, n: number) => isoDay(new Date(now.getTime() - n * DAY));

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
}
