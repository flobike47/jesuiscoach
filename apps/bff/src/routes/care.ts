import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser, type AuthUser } from '../auth.js';
import type { Actor, CareStore } from '../db/careRepo.js';
import { careStoreFor } from '../careStore.js';
import { CARE_LIMITS, checkWorkout, splitInjuries, validateAvailability, validateEquipment, validateException, validateInjury, validateWorkoutCheck, type Warning, type WorkoutCheck } from '../lib/care.js';
import { isoDay } from '../lib/summary.js';
import { assertCanView, teamOf } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, Conflict, Forbidden, NotFound, clampArray, validateUuid } from '../validation.js';

/**
 * Fiche profil « soin » : semaine type, matériel, exceptions, blessures
 * (données de santé : athlète et coach seulement) et avertissements à l'envoi
 * d'une séance. Rien de cette fiche n'est envoyé à Intervals.icu.
 */

/** Store de l'athlète + son nom (pour les messages d'avertissement). */

/** Qui modifie : l'athlète lui-même, ou son coach. */
const actorOf = (me: AuthUser, athleteId: string): Actor => (me.athleteId === athleteId ? 'athlete' : 'coach');

/** Accès à la fiche d'un athlète : utilisateur connecté, id valide, puis droit de voir (404 sinon). */
async function careAccess(req: FastifyRequest, id: string): Promise<{ me: AuthUser; store: CareStore; by: Actor }> {
  const me = requireUser(req);
  if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
  await assertCanView(me, id);
  const { store } = await careStoreFor(id);
  return { me, store, by: actorOf(me, id) };
}

/** Avertissements pour une séance envoyée à un athlète (aucun appel Intervals.icu). */
export async function warningsOfAthlete(athleteId: string, check: WorkoutCheck): Promise<Warning[]> {
  const { store, name } = await careStoreFor(athleteId);
  return checkWorkout(check, { name, state: await store.read() });
}

const ATHLETE = '/athletes/:id/care';

export async function registerCareRoutes(app: FastifyInstance) {
  /** Fiche complète : semaine type, volume, exceptions, matériel, blessures (en cours / passées). */
  app.get<{ Params: { id: string } }>(ATHLETE, async (req) => {
    const { store } = await careAccess(req, req.params.id);
    const state = await store.read();
    return {
      weeklyMinutes: state.weeklyMinutes,
      days: state.days,
      exceptions: state.exceptions,
      equipment: state.equipment,
      injuries: splitInjuries(state.injuries, isoDay(new Date())),
      updatedBy: state.updatedBy,
      updatedAt: state.updatedAt,
    };
  });

  /** Remplace la semaine type et le volume visé. */
  app.put<{ Params: { id: string }; Body: unknown }>(`${ATHLETE}/availability`, async (req) => {
    const { store, by } = await careAccess(req, req.params.id);
    await store.replaceAvailability(validateAvailability(req.body), by);
    return { ok: true };
  });

  app.put<{ Params: { id: string }; Body: unknown }>(`${ATHLETE}/equipment`, async (req) => {
    const { store, by } = await careAccess(req, req.params.id);
    await store.setEquipment(validateEquipment(req.body), by);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: unknown }>(`${ATHLETE}/exceptions`, async (req, reply) => {
    const { store, by } = await careAccess(req, req.params.id);
    const exception = await store.addException(validateException(req.body), by);
    if (!exception) throw new Conflict(`${CARE_LIMITS.maxExceptions} exceptions au plus : supprime-en une ancienne`);
    reply.code(201);
    return exception;
  });

  app.delete<{ Params: { id: string; exceptionId: string } }>(`${ATHLETE}/exceptions/:exceptionId`, async (req) => {
    const { store, by } = await careAccess(req, req.params.id);
    if (!(await store.deleteException(validateUuid(req.params.exceptionId, 'exceptionId'), by))) throw new NotFound('Exception introuvable');
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: unknown }>(`${ATHLETE}/injuries`, async (req, reply) => {
    const { store, by } = await careAccess(req, req.params.id);
    const injury = await store.addInjury(validateInjury(req.body), by);
    if (!injury) throw new Conflict(`${CARE_LIMITS.maxInjuries} blessures au plus : supprime-en une ancienne`);
    reply.code(201);
    return injury;
  });

  app.put<{ Params: { id: string; injuryId: string }; Body: unknown }>(`${ATHLETE}/injuries/:injuryId`, async (req) => {
    const { store, by } = await careAccess(req, req.params.id);
    const injury = await store.updateInjury(validateUuid(req.params.injuryId, 'injuryId'), validateInjury(req.body), by);
    if (!injury) throw new NotFound('Blessure introuvable');
    return injury;
  });

  app.delete<{ Params: { id: string; injuryId: string } }>(`${ATHLETE}/injuries/:injuryId`, async (req) => {
    const { store, by } = await careAccess(req, req.params.id);
    if (!(await store.deleteInjury(validateUuid(req.params.injuryId, 'injuryId'), by))) throw new NotFound('Blessure introuvable');
    return { ok: true };
  });

  /**
   * Avertissements avant envoi d'une séance (coach seulement). Athlètes hors
   * équipe ignorés, comme `POST /workouts`. Ne consomme aucun quota.
   */
  app.post<{ Body: { athleteIds?: unknown } & Record<string, unknown> }>('/workouts/check', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const body = req.body ?? {};
    if (!Array.isArray(body.athleteIds) || body.athleteIds.length === 0) throw new BadRequest('athleteIds requis');
    const check = validateWorkoutCheck(body);
    const team = new Set(await teamOf(me));
    const targets = [...new Set(clampArray(body.athleteIds, 50))].filter((id): id is string => typeof id === 'string' && team.has(id));
    const results = await Promise.all(targets.map(async (id) => ({ id, warnings: await warningsOfAthlete(id, check) })));
    return { results };
  });
}
