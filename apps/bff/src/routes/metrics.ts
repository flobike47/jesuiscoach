import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { storeOf } from '../activityStore.js';
import { isoDay } from '../lib/summary.js';
import { assertCanView, sourceFor } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, clampInt } from '../validation.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Comparaison des calculs de l'app avec ceux d'Intervals.icu, sortie par sortie
 * (sert à valider les formules sur de vraies sorties). Non affichée dans le web.
 */
export async function registerMetricsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: { days?: string } }>('/athletes/:id/metrics/compare', async (req) => {
    const me = requireUser(req);
    const id = req.params.id;
    if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
    await assertCanView(me, id);
    const days = clampInt(req.query.days, 30, 1, 90);
    const now = new Date();
    const from = isoDay(new Date(now.getTime() - days * DAY));
    const to = isoDay(now);
    const src = await sourceFor(id);
    const [activities, store] = await Promise.all([src.activities(id, from, to), storeOf(id, src, now)]);
    const stored = new Map((store ? await store.backend.list(from, to) : []).map((r) => [r.id, r]));

    const items = activities.map((a) => {
      const r = stored.get(String(a.id));
      const intervals = {
        load: a.icu_training_load ?? null,
        weightedWatts: a.icu_weighted_avg_watts ?? null,
        // Intervals.icu exprime l'intensité en pourcentage (65,3 = 0,653).
        intensity: a.icu_intensity == null ? null : Math.round(a.icu_intensity * 10) / 1000,
      };
      const app = r ? { load: r.load, weightedWatts: r.weightedWatts, intensity: r.intensity } : null;
      const diffPct = app?.load != null && intervals.load ? Math.round((Math.abs(app.load - intervals.load) / intervals.load) * 1000) / 10 : null;
      return {
        id: String(a.id),
        name: a.name ?? 'Sortie',
        date: a.start_date_local.slice(0, 10),
        sport: a.type ?? null,
        method: r?.loadMethod ?? null,
        app,
        intervals,
        diffPct,
      };
    });

    const diffs = items.flatMap((i) => (i.diffPct == null ? [] : [i.diffPct]));
    const meanDiffPct = diffs.length ? Math.round((diffs.reduce((s, d) => s + d, 0) / diffs.length) * 10) / 10 : null;
    return { items, meanDiffPct };
  });
}
