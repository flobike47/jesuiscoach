import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { redis } from '../cache.js';
import { matchPlan } from '../lib/plan.js';
import { validateWorkoutCheck } from '../lib/care.js';
import { warningsOfAthlete } from './care.js';
import { validateSport } from '../lib/sport.js';
import { enforceQuota } from '../ratelimit.js';
import { assertCanView, sourceFor, teamOf } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, DATE_RE, Forbidden, HttpError, clampArray, validateString } from '../validation.js';

/**
 * Calendrier des athlètes : lecture (séances prévues + sorties faites),
 * déplacement / suppression d'une séance, envoi d'une séance à l'équipe.
 * Phase C : ce module devient la porte d'entrée du calendrier stocké dans
 * l'app (voir docs/plans/C-calendrier.md).
 */

const DAY = 24 * 60 * 60 * 1000;
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

interface AssignBody {
  athleteIds: string[];
  date: string;
  name: string;
  description: string;
  sport?: unknown;
  /** Contrôle des avertissements (routes/care.ts) : durée estimée, puissance, effort au-dessus du seuil. */
  durationSec?: unknown;
  usesPower?: unknown;
  highIntensity?: unknown;
  /** Athlètes pour lesquels l'envoi malgré un blocage (blessure) a été confirmé. */
  force?: unknown;
}

export async function registerCalendarRoutes(app: FastifyInstance) {
  /** Calendrier d'un athlète entre deux dates (séances prévues + sorties faites). */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>('/athletes/:id/calendar', async (req) => {
    const me = requireUser(req);
    const id = req.params.id;
    if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
    const { from, to } = req.query;
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw new BadRequest('from / to invalides (AAAA-MM-JJ)');
    if ((Date.parse(to) - Date.parse(from)) / DAY > 62) throw new BadRequest('Période limitée à 62 jours');
    await assertCanView(me, id);
    const src = await sourceFor(id);
    const [events, activities] = await Promise.all([src.events(id, from, to), src.activities(id, from, to)]);
    const { activityOf } = matchPlan(events, activities);
    // Séances réalisées, par id : le web n'a plus à deviner « une sortie le même jour ».
    const doneEventIds = [...activityOf.keys()].filter((e) => e.id != null).map((e) => String(e.id));
    return { events, activities, doneEventIds };
  });

  /** Déplace une séance prévue (l'athlète lui-même ou son coach). */
  app.put<{ Params: { id: string; eventId: string }; Body: { date?: string } }>('/athletes/:id/events/:eventId', async (req) => {
    const me = requireUser(req);
    const { id, eventId } = req.params;
    if (!ATHLETE_ID_RE.test(id) || !EVENT_ID_RE.test(eventId)) throw new BadRequest('id invalide');
    const date = req.body?.date;
    if (typeof date !== 'string' || !DATE_RE.test(date)) throw new BadRequest('date invalide (AAAA-MM-JJ)');
    await assertCanView(me, id);
    await enforceQuota(me.id, 'editCalendar');
    const event = await (await sourceFor(id)).moveEvent(id, eventId, date);
    await invalidateEvents(id);
    return { event };
  });

  /** Supprime une séance prévue (l'athlète lui-même ou son coach). */
  app.delete<{ Params: { id: string; eventId: string } }>('/athletes/:id/events/:eventId', async (req) => {
    const me = requireUser(req);
    const { id, eventId } = req.params;
    if (!ATHLETE_ID_RE.test(id) || !EVENT_ID_RE.test(eventId)) throw new BadRequest('id invalide');
    await assertCanView(me, id);
    await enforceQuota(me.id, 'editCalendar');
    await (await sourceFor(id)).deleteEvent(id, eventId);
    await invalidateEvents(id);
    return { ok: true };
  });

  /** Envoi d'une séance au calendrier Intervals.icu de plusieurs athlètes. */
  app.post<{ Body: AssignBody }>('/workouts', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const body = req.body ?? ({} as AssignBody);
    if (!Array.isArray(body.athleteIds) || body.athleteIds.length === 0) throw new BadRequest('athleteIds requis');
    if (typeof body.date !== 'string' || !DATE_RE.test(body.date)) throw new BadRequest('date invalide (AAAA-MM-JJ)');
    const workout = {
      date: body.date,
      name: validateString(body.name, 'name', 120),
      description: validateString(body.description, 'description', 4000),
      sport: validateSport(body.sport),
    };
    const team = new Set(await teamOf(me));
    const targets = clampArray(body.athleteIds, 50).filter((id): id is string => typeof id === 'string' && team.has(id));
    if (targets.length === 0) throw new BadRequest('Aucun athlète de ton équipe dans la sélection');
    // Avertissements « bloquants » (blessure en cours) : pas d'envoi sans `force` pour cet athlète.
    const check = validateWorkoutCheck({ ...workout, durationSec: body.durationSec, usesPower: body.usesPower, highIntensity: body.highIntensity });
    const forced = new Set(Array.isArray(body.force) ? clampArray(body.force, 50).filter((x): x is string => typeof x === 'string') : []);
    const checked = await Promise.all(targets.map(async (id) => ({ id, warnings: await warningsOfAthlete(id, check) })));
    const blocked = new Map<string, string>();
    for (const { id, warnings } of checked) {
      const block = warnings.find((w) => w.level === 'block');
      if (block && !forced.has(id)) blocked.set(id, block.title);
    }
    await enforceQuota(me.id, 'assignWorkout');

    const results = await Promise.all(
      targets.map(async (id) => {
        const blockedBy = blocked.get(id);
        if (blockedBy) return { id, ok: false as const, blocked: true as const, error: blockedBy };
        try {
          await (await sourceFor(id)).createWorkout(id, workout);
          await invalidateEvents(id);
          return { id, ok: true as const };
        } catch (e) {
          req.log.warn({ err: e, athleteId: id }, 'workouts: envoi en échec');
          return { id, ok: false as const, error: e instanceof HttpError ? e.message : "Envoi à Intervals.icu impossible" };
        }
      }),
    );
    return { results };
  });
}

/** Le calendrier vient de changer : on jette les plages d'événements en cache. */
async function invalidateEvents(athleteId: string) {
  try {
    const keys = await redis.keys(`icu:events:${athleteId}:*`);
    if (keys.length) await redis.del(...keys);
  } catch {
    /* Redis down : le TTL de 10 min fera le travail */
  }
}
