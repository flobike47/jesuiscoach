import { config } from './config.js';
import { cachedJson, TTL } from './cache.js';
import { DemoSource } from './demo.js';
import { decrypt, parseKey } from './lib/crypto.js';
import { IntervalsClient } from './providers/intervals.js';
import { intervalsTokenOf, teamAthleteIds } from './db/repo.js';
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
  };
}
