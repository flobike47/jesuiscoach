import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser, type AuthUser } from '../auth.js';
import { createEvent } from '../calendarService.js';
import {
  deletePlan,
  deleteSavedWorkout,
  insertPlan,
  insertSavedWorkout,
  planOf,
  plansOf,
  savedWorkoutsOf,
  updatePlan,
  updateSavedWorkout,
  type PlanRow,
  type SavedWorkoutRow,
} from '../db/repo.js';
import { validateSport } from '../lib/sport.js';
import { libraryView } from '../lib/library.js';
import { PLAN_LIMITS, planDates, validatePlanWorkouts } from '../lib/plans.js';
import { enforceQuota } from '../ratelimit.js';
import { sourceFor, teamOf } from '../sources.js';
import { BadRequest, Conflict, DATE_RE, Forbidden, HttpError, NotFound, clampArray, validateString, validateUuid } from '../validation.js';

/**
 * Planification du coach : bibliothèque Intervals.icu (lecture seule) et
 * plans sur plusieurs semaines, appliqués au calendrier des athlètes.
 */

interface PlanBody {
  name?: unknown;
  workouts?: unknown;
}

interface ApplyBody {
  athleteIds?: unknown;
  startDate?: unknown;
}

function requireCoach(req: FastifyRequest): AuthUser {
  const me = requireUser(req);
  if (me.role !== 'coach') throw new Forbidden();
  return me;
}

const planJson = (p: PlanRow) => ({ id: p.id, name: p.name, workouts: p.workouts, updatedAt: new Date(p.updated_at).toISOString() });

/** 200 séances enregistrées au plus par coach. */
const MAX_SAVED_WORKOUTS = 200;

interface SavedBody {
  name?: unknown;
  sport?: unknown;
  description?: unknown;
}

const savedJson = (w: SavedWorkoutRow) => ({ id: w.id, name: w.name, sport: w.sport, description: w.description, updatedAt: new Date(w.updated_at).toISOString() });

function savedInput(body: SavedBody | undefined) {
  if (typeof body?.name !== 'string' || typeof body.description !== 'string') throw new BadRequest('name et description requis');
  return { name: validateString(body.name, 'name', 120), sport: validateSport(body.sport), description: validateString(body.description, 'description', 4000) };
}

function planInput(body: PlanBody | undefined) {
  if (typeof body?.name !== 'string') throw new BadRequest('name requis');
  return { name: validateString(body.name, 'name', 120), workouts: validatePlanWorkouts(body.workouts) };
}

export async function registerPlanningRoutes(app: FastifyInstance) {
  /** Bibliothèque Intervals.icu du coach (séances vélo envoyables). */
  app.get('/library', async (req) => {
    const me = requireCoach(req);
    const folders = await (await sourceFor(me.athleteId)).folders(me.athleteId);
    return { folders: libraryView(folders) };
  });

  /** Séances enregistrées sans envoi (« Mes séances »). */
  app.get('/saved-workouts', async (req) => {
    const me = requireCoach(req);
    return { workouts: (await savedWorkoutsOf(me.id)).map(savedJson) };
  });

  app.post<{ Body: SavedBody }>('/saved-workouts', async (req, reply) => {
    const me = requireCoach(req);
    const saved = await insertSavedWorkout(me.id, savedInput(req.body), MAX_SAVED_WORKOUTS);
    if (!saved) throw new Conflict(`${MAX_SAVED_WORKOUTS} séances au plus : supprime une ancienne séance`);
    reply.code(201);
    return savedJson(saved);
  });

  app.put<{ Params: { id: string }; Body: SavedBody }>('/saved-workouts/:id', async (req) => {
    const me = requireCoach(req);
    const saved = await updateSavedWorkout(me.id, validateUuid(req.params.id), savedInput(req.body));
    if (!saved) throw new NotFound('Séance introuvable');
    return savedJson(saved);
  });

  app.delete<{ Params: { id: string } }>('/saved-workouts/:id', async (req) => {
    const me = requireCoach(req);
    if (!(await deleteSavedWorkout(me.id, validateUuid(req.params.id)))) throw new NotFound('Séance introuvable');
    return { ok: true };
  });

  app.get('/plans', async (req) => {
    const me = requireCoach(req);
    return { plans: (await plansOf(me.id)).map(planJson) };
  });

  app.post<{ Body: PlanBody }>('/plans', async (req, reply) => {
    const me = requireCoach(req);
    const { name, workouts } = planInput(req.body);
    const plan = await insertPlan(me.id, name, workouts, PLAN_LIMITS.maxPlansPerCoach);
    if (!plan) throw new Conflict(`${PLAN_LIMITS.maxPlansPerCoach} plans au plus : supprime un ancien plan`);
    reply.code(201);
    return planJson(plan);
  });

  app.put<{ Params: { id: string }; Body: PlanBody }>('/plans/:id', async (req) => {
    const me = requireCoach(req);
    const id = validateUuid(req.params.id);
    const { name, workouts } = planInput(req.body);
    const plan = await updatePlan(me.id, id, name, workouts);
    if (!plan) throw new NotFound('Plan introuvable');
    return planJson(plan);
  });

  app.delete<{ Params: { id: string } }>('/plans/:id', async (req) => {
    const me = requireCoach(req);
    if (!(await deletePlan(me.id, validateUuid(req.params.id)))) throw new NotFound('Plan introuvable');
    return { ok: true };
  });

  /**
   * Applique un plan à partir d'une date : chaque séance est créée dans le
   * calendrier Intervals.icu de chaque athlète choisi (une écriture par
   * séance, sur le quota `assignWorkout` du coach). Séances d'un même athlète
   * envoyées une à une, athlètes en parallèle.
   */
  app.post<{ Params: { id: string }; Body: ApplyBody }>('/plans/:id/apply', async (req) => {
    const me = requireCoach(req);
    const plan = await planOf(me.id, validateUuid(req.params.id));
    if (!plan) throw new NotFound('Plan introuvable');
    const { athleteIds, startDate } = req.body ?? {};
    if (typeof startDate !== 'string' || !DATE_RE.test(startDate) || Number.isNaN(Date.parse(startDate))) throw new BadRequest('startDate invalide (AAAA-MM-JJ)');
    if (!Array.isArray(athleteIds) || athleteIds.length === 0) throw new BadRequest('athleteIds requis');
    const team = new Set(await teamOf(me));
    const targets = [...new Set(clampArray(athleteIds, 50))].filter((id): id is string => typeof id === 'string' && team.has(id));
    if (targets.length === 0) throw new BadRequest('Aucun athlète de ton équipe dans la sélection');

    const dated = planDates(startDate, validatePlanWorkouts(plan.workouts));
    const writes = dated.length * targets.length;
    if (writes > PLAN_LIMITS.maxWritesPerApply) {
      throw new BadRequest(`Trop de séances d'un coup (${writes}) : ${PLAN_LIMITS.maxWritesPerApply} au plus. Applique le plan à moins d'athlètes à la fois.`);
    }
    await enforceQuota(me.id, 'assignWorkout', writes);

    // Chaque séance devient une ligne du calendrier de l'athlète, recopiée vers Intervals.icu (quota déjà compté ci-dessus).
    // Arrêt à la première séance en erreur, comme avant : les suivantes ne partent pas.
    const results = await Promise.all(
      targets.map(async (id) => {
        let created = 0;
        try {
          for (const w of dated) {
            const row = await createEvent(id, { kind: 'workout', date: w.date, name: w.name, description: w.description, sport: w.sport ?? 'Ride', racePriority: null, raceDistanceM: null, raceGoal: null }, 'coach');
            if (row.syncStatus !== 'synced') {
              return { id, ok: false as const, created, error: row.syncError ?? 'Envoi à Intervals.icu impossible' };
            }
            created++;
          }
          return { id, ok: true as const, created };
        } catch (e) {
          req.log.warn({ err: e, athleteId: id, created }, 'plans: application en échec');
          return { id, ok: false as const, created, error: e instanceof HttpError ? e.message : 'Envoi à Intervals.icu impossible' };
        }
      }),
    );
    return { total: dated.length, results };
  });
}
