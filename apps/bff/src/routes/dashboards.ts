import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { activityView, mondayOf, powerView, zonesView } from '../lib/dashboards.js';
import { isoDay } from '../lib/summary.js';
import { assertCanView, sourceFor } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, NotFound, clampInt } from '../validation.js';

/**
 * Tableaux de bord avancés d'un athlète (lui-même ou son coach) :
 * courbe de puissance, temps par zone, détail d'une sortie.
 * Tout passe par le cache de sources.ts (quota Intervals.icu).
 */

/** Identifiants de sortie : `i123…` pour Intervals.icu, numériques pour les anciennes, `demo-…` en démo. */
const ACTIVITY_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DAY = 24 * 60 * 60 * 1000;

function athleteParam(id: string): string {
  if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
  return id;
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/athletes/:id/power', async (req) => {
    const me = requireUser(req);
    const id = athleteParam(req.params.id);
    await assertCanView(me, id);
    const src = await sourceFor(id);
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
    return zonesView(activities, info, weeks, now);
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
    const streams = await src.streams(id, activityId);
    return activityView(detail, streams);
  });
}
