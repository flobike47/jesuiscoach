import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser, type AuthUser } from '../auth.js';
import { calendarStoreFor, createEvent, readCalendar, removeEvent, resyncEvent, teamDay, updateEvent } from '../calendarService.js';
import { validateWorkoutCheck } from '../lib/care.js';
import { warningsOfAthlete } from './care.js';
import { CALENDAR_LIMITS, eventJson, goalJson, parisToday, validateEventInput, validateEventPatch, validateGoalInput, type GoalInput, type CalendarRow } from '../lib/calendar.js';
import { validateSport } from '../lib/sport.js';
import { enforceQuota } from '../ratelimit.js';
import { assertCanView, teamOf } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, Conflict, DATE_RE, Forbidden, NotFound, clampArray, validateString, validateUuid } from '../validation.js';

/**
 * Calendrier des athlètes (phase C) : séances, compétitions et notes stockées
 * dans l'app et recopiées vers Intervals.icu ; vue « Aujourd'hui » du coach ;
 * objectifs. Règles de synchronisation : lib/calendar.ts et calendarService.ts.
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

/** Accès en lecture ou en écriture au calendrier d'un athlète : connecté, id valide, droit de voir (404 sinon). */
async function access(req: FastifyRequest, id: string): Promise<{ me: AuthUser; by: 'athlete' | 'coach' }> {
  const me = requireUser(req);
  if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
  await assertCanView(me, id);
  return { me, by: me.athleteId === id ? 'athlete' : 'coach' };
}

function checkEventId(id: string, eventId: string): void {
  if (!ATHLETE_ID_RE.test(id) || !EVENT_ID_RE.test(eventId)) throw new BadRequest('id invalide');
}

const raceJson = (r: CalendarRow) => ({
  id: r.id,
  name: r.name,
  date: r.day,
  racePriority: r.racePriority,
  raceDistanceM: r.raceDistanceM,
  raceGoal: r.raceGoal,
  syncStatus: r.syncStatus,
});

export async function registerCalendarRoutes(app: FastifyInstance) {
  /** Calendrier d'un athlète entre deux dates (séances prévues, compétitions, sorties faites). */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>('/athletes/:id/calendar', async (req) => {
    const { id } = req.params;
    const { from, to } = req.query;
    if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw new BadRequest('from / to invalides (AAAA-MM-JJ)');
    if ((Date.parse(to) - Date.parse(from)) / DAY > CALENDAR_LIMITS.maxRange) throw new BadRequest(`Période limitée à ${CALENDAR_LIMITS.maxRange} jours`);
    await access(req, id);
    return readCalendar(id, from, to);
  });

  /** Crée une séance, une compétition (A/B/C) ou une note dans le calendrier de l'athlète. */
  app.post<{ Params: { id: string }; Body: unknown }>('/athletes/:id/events', async (req, reply) => {
    const { id } = req.params;
    const { me, by } = await access(req, id);
    const input = validateEventInput(req.body);
    await enforceQuota(me.id, 'editCalendar');
    const row = await createEvent(id, input, by);
    reply.code(201);
    return { event: eventJson(row) };
  });

  /** Modifie une séance / compétition / note (corps partiel). `eventId` : id Intervals.icu ou id de l'app. */
  app.put<{ Params: { id: string; eventId: string }; Body: unknown }>('/athletes/:id/events/:eventId', async (req) => {
    const { id, eventId } = req.params;
    checkEventId(id, eventId);
    const { me } = await access(req, id);
    const patch = validateEventPatch(req.body);
    await enforceQuota(me.id, 'editCalendar');
    return { event: eventJson(await updateEvent(id, eventId, patch)) };
  });

  /** Supprime un événement (chez Intervals.icu aussi). Si Intervals.icu refuse, la ligne reste en erreur. */
  app.delete<{ Params: { id: string; eventId: string } }>('/athletes/:id/events/:eventId', async (req) => {
    const { id, eventId } = req.params;
    checkEventId(id, eventId);
    const { me } = await access(req, id);
    await enforceQuota(me.id, 'editCalendar');
    const result = await removeEvent(id, eventId);
    return result.removed ? { ok: true } : { ok: false, syncStatus: 'error', error: result.syncError };
  });

  /** Renvoie vers Intervals.icu un événement non synchronisé (ou supprimé là-bas). */
  app.post<{ Params: { id: string; eventId: string } }>('/athletes/:id/events/:eventId/resync', async (req) => {
    const { id, eventId } = req.params;
    checkEventId(id, eventId);
    const { me } = await access(req, id);
    await enforceQuota(me.id, 'editCalendar');
    return { event: eventJson(await resyncEvent(id, eventId)) };
  });

  /**
   * Envoi d'une séance au calendrier de plusieurs athlètes (coach). Contrôles A2
   * (blessures : pas d'envoi sans `force`). Un athlète = une ligne, recopiée vers Intervals.icu.
   */
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
        if (blockedBy) return { id, ok: false as const, blocked: true as const, syncStatus: 'error' as const, error: blockedBy };
        try {
          const row = await createEvent(id, { kind: 'workout', ...workout, description: workout.description, racePriority: null, raceDistanceM: null, raceGoal: null }, 'coach');
          return {
            id,
            ok: row.syncStatus === 'synced',
            eventId: row.intervalsId ?? row.id,
            syncStatus: row.syncStatus,
            ...(row.syncError ? { error: row.syncError } : {}),
          };
        } catch (e) {
          req.log.warn({ err: e, athleteId: id }, 'workouts: envoi en échec');
          return { id, ok: false as const, syncStatus: 'error' as const, error: e instanceof Error ? e.message : 'Envoi impossible' };
        }
      }),
    );
    return { results };
  });

  /** Vue « Aujourd'hui » du coach : séances prévues, sorties faites et statut de chaque athlète de son équipe. */
  app.get<{ Querystring: { date?: string } }>('/team/today', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const date = req.query.date ?? parisToday();
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new BadRequest('date invalide (AAAA-MM-JJ)');
    const athletes = await teamDay(clampArray(await teamOf(me), 50), date);
    return { date, athletes };
  });

  /** Prochaines compétitions et objectifs de l'athlète. */
  app.get<{ Params: { id: string } }>('/athletes/:id/goals', async (req) => {
    const { id } = req.params;
    await access(req, id);
    const store = await calendarStoreFor(id);
    const [races, goals] = await Promise.all([store.races(parisToday()), store.goals()]);
    return { races: races.map(raceJson), goals: goals.map(goalJson) };
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/athletes/:id/goals', async (req, reply) => {
    const { id } = req.params;
    const { by } = await access(req, id);
    const input = validateGoalInput(req.body) as GoalInput;
    const store = await calendarStoreFor(id);
    if (input.raceId && !(await store.raceExists(input.raceId))) throw new BadRequest('Compétition introuvable');
    const goal = await store.insertGoal(input, by, CALENDAR_LIMITS.maxGoals);
    if (!goal) throw new Conflict(`${CALENDAR_LIMITS.maxGoals} objectifs au plus : supprime-en un ancien`);
    reply.code(201);
    return goalJson(goal);
  });

  app.put<{ Params: { id: string; goalId: string }; Body: unknown }>('/athletes/:id/goals/:goalId', async (req) => {
    const { id } = req.params;
    const goalId = validateUuid(req.params.goalId, 'goalId');
    await access(req, id);
    const store = await calendarStoreFor(id);
    const current = await store.goal(goalId);
    if (!current) throw new NotFound('Objectif introuvable');
    const patch = validateGoalInput(req.body, true);
    if (patch.raceId && !(await store.raceExists(patch.raceId))) throw new BadRequest('Compétition introuvable');
    const merged: GoalInput = {
      title: current.title,
      metric: current.metric,
      targetValue: current.targetValue,
      dueDay: current.dueDay,
      raceId: current.raceId,
      achievedOn: current.achievedOn,
      note: current.note,
      ...patch,
    };
    const goal = await store.updateGoal(goalId, merged);
    if (!goal) throw new NotFound('Objectif introuvable');
    return goalJson(goal);
  });

  app.delete<{ Params: { id: string; goalId: string } }>('/athletes/:id/goals/:goalId', async (req) => {
    const { id } = req.params;
    const goalId = validateUuid(req.params.goalId, 'goalId');
    await access(req, id);
    const store = await calendarStoreFor(id);
    if (!(await store.deleteGoal(goalId))) throw new NotFound('Objectif introuvable');
    return { ok: true };
  });
}

