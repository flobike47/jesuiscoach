import { config } from './config.js';
import { cachedJson, invalidateKeys, redis, TTL } from './cache.js';
import { DemoSource } from './demo.js';
import { decrypt, parseKey } from './lib/crypto.js';
import { IntervalsClient } from './providers/intervals.js';
import { checkinsOf, deleteUser, intervalsTokenOf, teamAthleteIds, upsertCheckin, type CheckinRow } from './db/repo.js';
import { revokeAllSessions } from './sessions.js';
import type { AuthUser } from './auth.js';
import type { IntervalsActivity, IntervalsAthlete, IntervalsEvent, IntervalsWellness, NewWorkoutEvent } from './types.js';
import { HttpError, NotFound } from './validation.js';

/**
 * Accès aux données d'un athlète, qu'elles viennent d'Intervals.icu (avec le
 * jeton OAuth de l'athlète, mis en cache Redis) ou du mode démo.
 */
export interface AthleteSource {
  athlete(id: string): Promise<IntervalsAthlete>;
  wellness(id: string, oldest: string, newest: string): Promise<IntervalsWellness[]>;
  activities(id: string, oldest: string, newest: string): Promise<IntervalsActivity[]>;
  events(id: string, oldest: string, newest: string): Promise<IntervalsEvent[]>;
  createWorkout(id: string, workout: NewWorkoutEvent): Promise<IntervalsEvent>;
  moveEvent(id: string, eventId: string, date: string): Promise<IntervalsEvent>;
  deleteEvent(id: string, eventId: string): Promise<void>;
}

export class NotConnected extends HttpError {
  constructor() { super(409, "Cet athlète n'a pas (ou plus) connecté son compte Intervals.icu"); }
}

let demo: DemoSource | null = null;
export function demoSource(): DemoSource {
  demo ??= new DemoSource();
  return demo;
}

/** IDs Intervals des athlètes suivis par ce coach (en démo : l'équipe fictive). */
export async function teamOf(coach: AuthUser): Promise<string[]> {
  if (config.demoMode) return demoSource().athleteIds();
  return teamAthleteIds(coach.id);
}

/** Vérifie que `viewer` peut voir l'athlète `athleteId` (lui-même ou son coach). */
export async function assertCanView(viewer: AuthUser, athleteId: string): Promise<void> {
  if (viewer.athleteId === athleteId) return;
  if (viewer.role === 'coach' && (await teamOf(viewer)).includes(athleteId)) return;
  throw new NotFound('Athlète introuvable');
}

/** Source de données pour un athlète donné. */
export async function sourceFor(athleteId: string): Promise<AthleteSource> {
  if (config.demoMode) return demoSource();
  if (!config.tokenEncryptionKey) throw new NotConnected();
  const enc = await intervalsTokenOf(athleteId);
  if (!enc) throw new NotConnected();
  const token = decrypt(enc, parseKey(config.tokenEncryptionKey));
  return cachedSource(athleteId, new IntervalsClient({ kind: 'oauth', accessToken: token }));
}

/** Enveloppe une source avec le cache Redis (le quota OAuth est de 100 req/jour). */
function cachedSource(athleteId: string, client: IntervalsClient): AthleteSource {
  const k = (kind: string, ...parts: string[]) => `icu:${kind}:${athleteId}:${parts.join(':')}`;
  return {
    athlete: (id) => cachedJson(k('athlete'), TTL.athlete, () => client.athlete(id)),
    wellness: (id, o, n) => cachedJson(k('wellness', o, n), TTL.wellness, () => client.wellness(id, o, n)),
    activities: (id, o, n) => cachedJson(k('activities', o, n), TTL.activities, () => client.activities(id, o, n)),
    events: (id, o, n) => cachedJson(k('events', o, n), TTL.events, () => client.events(id, o, n)),
    createWorkout: (id, w) => client.createWorkout(id, w),
    moveEvent: (id, eventId, date) => client.moveEvent(id, eventId, date),
    deleteEvent: (id, eventId) => client.deleteEvent(id, eventId),
  };
}

/** Ressentis : en base, ou en mémoire en mode démo (les comptes démo n'existent pas en base). */
export async function saveCheckin(user: AuthUser, c: CheckinRow): Promise<void> {
  if (config.demoMode) return demoSource().saveCheckin(user.athleteId, c);
  return upsertCheckin(user.id, c);
}

export async function listCheckins(athleteId: string, from: string, to: string): Promise<CheckinRow[]> {
  if (config.demoMode) return demoSource().listCheckins(athleteId, from, to);
  return checkinsOf(athleteId, from, to);
}

/**
 * Suppression de compte : révoque le jeton chez Intervals.icu (au mieux : un
 * jeton déjà révoqué par l'athlète ne doit pas bloquer la suppression), puis
 * efface l'utilisateur (sessions, jeton, ressentis, notifications et liens
 * coach en cascade) et les copies en cache de ses données.
 */
export async function deleteAccount(user: AuthUser, onRevokeError: (err: unknown) => void): Promise<void> {
  const enc = await intervalsTokenOf(user.athleteId);
  if (enc && config.tokenEncryptionKey) {
    try {
      const token = decrypt(enc, parseKey(config.tokenEncryptionKey));
      await new IntervalsClient({ kind: 'oauth', accessToken: token }).disconnect();
    } catch (err) {
      onRevokeError(err);
    }
  }
  await revokeAllSessions(user.id);
  await deleteUser(user.id);
  await invalidateKeys(`icu:*:${user.athleteId}:*`);
  await redis.del(`webhook:pending:${user.athleteId}`).catch(() => undefined);
}
