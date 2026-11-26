import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { storeOf, streamsOf } from '../activityStore.js';
import { activityView, downsampleStreams, mondayOf, powerView, zonesView, ZONE_NAMES, type ZoneRange } from '../lib/dashboards.js';
import { HR_ZONE_UPPER, POWER_ZONE_UPPER, powerFromBests } from '../lib/metrics.js';
import { ftpOf, isoDay } from '../lib/summary.js';
import { assertCanView, sourceFor } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, NotFound, clampInt } from '../validation.js';

/**
 * Tableaux de bord avancés d'un athlète (lui-même ou son coach) :
 * courbe de puissance, temps par zone, détail d'une sortie.
 * Quand l'app a copié les sorties (src/activityStore.ts), ses calculs et ses
 * courbes sont utilisés ; sinon on garde Intervals.icu (cache de sources.ts).
 * La forme des réponses ne change pas ; `source` indique l'origine des chiffres.
 */

/** Identifiants de sortie : `i123…` pour Intervals.icu, numériques pour les anciennes, `demo-…` en démo. */
const ACTIVITY_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DAY = 24 * 60 * 60 * 1000;

function athleteParam(id: string): string {
  if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
  return id;
}

const daysAgo = (now: Date, n: number) => isoDay(new Date(now.getTime() - n * DAY));

/** Bornes des zones en unités réelles (watts ou bpm), comme `ranges` de lib/dashboards.ts. */
function zoneRanges(upper: readonly number[], toUnit: (pct: number) => number, count: number): ZoneRange[] {
  return Array.from({ length: count }, (_, i) => ({
    name: ZONE_NAMES[i],
    from: i === 0 ? 0 : toUnit(upper[i - 1]) + 1,
    to: i < upper.length ? toUnit(upper[i]) : null,
  }));
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/athletes/:id/power', async (req) => {
    const me = requireUser(req);
    const id = athleteParam(req.params.id);
    await assertCanView(me, id);
    const src = await sourceFor(id);
    const store = await storeOf(id, src);
    const now = new Date();
    const bests = store ? await store.backend.bests(daysAgo(now, 365), isoDay(now)) : [];
    if (store && bests.length > 0) {
      const [info, profile] = await Promise.all([src.athlete(id), store.profile()]);
      const from90 = daysAgo(now, 90);
      return powerFromBests({
        bests: { '90d': bests.filter((b) => b.startLocal.slice(0, 10) >= from90), '1y': bests },
        ftp: profile?.physiology.Ride.ftp ?? ftpOf(info),
        weightKg: profile?.identity.weightKg ?? info.icu_weight ?? null,
      });
    }
    const [curves, info] = await Promise.all([src.powerCurves(id), src.athlete(id)]);
    return powerView(curves, info);
  });

  app.get<{ Params: { id: string }; Querystring: { weeks?: string } }>('/athletes/:id/zones', async (req) => {
    const me = requireUser(req);
    const id = athleteParam(req.params.id);
    const weeks = clampInt(req.query.weeks, 8, 4, 26);
    await assertCanView(me, id);
    const now = new Date();
    const from = isoDay(new Date(Date.parse(`${mondayOf(isoDay(now))}T12:00:00Z`) - (weeks - 1) * 7 * DAY));
    const src = await sourceFor(id);
    const [activities, info] = await Promise.all([src.activities(id, from, isoDay(now)), src.athlete(id)]);
    const store = await storeOf(id, src, now);
    const stored = new Map((store ? await store.backend.list(from, isoDay(now)) : []).map((r) => [r.id, r]));
    const profile = store ? await store.profile() : null;
    // Temps par zone calculés par l'app quand ils existent ; sinon ceux d'Intervals.icu, sortie par sortie.
    let fromApp = false;
    const merged = activities.map((a) => {
      const r = stored.get(String(a.id));
      if (!r || (!r.powerZoneSecs && !r.hrZoneSecs)) return a;
      fromApp = true;
      return {
        ...a,
        icu_zone_times: r.powerZoneSecs ? r.powerZoneSecs.map((secs, i) => ({ id: `Z${i + 1}`, secs })) : a.icu_zone_times,
        icu_hr_zone_times: r.hrZoneSecs ?? a.icu_hr_zone_times,
      };
    });
    const view = zonesView(merged, info, weeks, now);
    if (!profile) return { ...view, source: fromApp ? 'app' : 'intervals' };
    // Bornes des zones depuis la fiche de l'app.
    const ftp = profile.physiology.Ride.ftp ?? view.ftp;
    const lthr = profile.physiology.Ride.lthr;
    return {
      ...view,
      ftp,
      powerZones: ftp ? zoneRanges(POWER_ZONE_UPPER, (v) => Math.round((ftp * v) / 100), ZONE_NAMES.length) : view.powerZones,
      hrZones: lthr ? zoneRanges(HR_ZONE_UPPER, (v) => Math.round((lthr * v) / 100), HR_ZONE_UPPER.length + 1) : view.hrZones,
      source: fromApp ? 'app' : 'intervals',
    };
  });

  app.get<{ Params: { id: string; activityId: string } }>('/athletes/:id/activities/:activityId', async (req) => {
    const me = requireUser(req);
    const id = athleteParam(req.params.id);
    const { activityId } = req.params;
    if (!ACTIVITY_ID_RE.test(activityId)) throw new BadRequest('id de sortie invalide');
    await assertCanView(me, id);
    const src = await sourceFor(id);
    const detail = await src.activity(id, activityId);
    // La sortie doit appartenir à l'athlète demandé (sinon : 404, sans rien révéler).
    if (detail.icu_athlete_id && detail.icu_athlete_id !== id) throw new NotFound('Sortie introuvable');
    const store = await storeOf(id, src);
    const row = store ? await store.backend.get(activityId) : null;
    const series = store && row ? await store.backend.loadStreams(activityId) : null;
    const streams = series ? downsampleStreams(streamsOf(series)) : await src.streams(id, activityId);
    const view = activityView(detail, streams);
    if (!row) return { ...view, source: 'intervals' };
    // Chiffres clés et zones de l'app quand ils sont calculés ; le reste (intervalles, dérive) vient d'Intervals.icu.
    return {
      ...view,
      source: 'app',
      activity: {
        ...view.activity,
        load: row.load ?? view.activity.load,
        weightedWatts: row.weightedWatts ?? view.activity.weightedWatts,
        intensity: row.intensity ?? view.activity.intensity,
      },
      powerZones: row.powerZoneSecs ?? view.powerZones,
      hrZones: row.hrZoneSecs ?? view.hrZones,
    };
  });
}
