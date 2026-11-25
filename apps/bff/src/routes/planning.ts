import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser, type AuthUser } from '../auth.js';
import { invalidateKeys } from '../cache.js';
import { deletePlan, insertPlan, planOf, plansOf, updatePlan, type PlanRow } from '../db/repo.js';
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

    const results = await Promise.all(
      targets.map(async (id) => {
        let created = 0;
        try {
          const src = await sourceFor(id);
          for (const w of dated) {
            await src.createWorkout(id, { date: w.date, name: w.name, description: w.description });
            created++;
          }
          return { id, ok: true as const, created };
        } catch (e) {
          req.log.warn({ err: e, athleteId: id, created }, 'plans: application en échec');
          return { id, ok: false as const, created, error: e instanceof HttpError ? e.message : 'Envoi à Intervals.icu impossible' };
        } finally {
          await invalidateKeys(`icu:events:${id}:*`);
        }
      }),
    );
    return { total: dated.length, results };
  });
}
