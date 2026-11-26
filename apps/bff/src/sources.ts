import { config } from './config.js';
import { cachedJson, invalidateKeys, redis, TTL } from './cache.js';
import { DemoSource } from './demo.js';
import { decrypt, parseKey } from './lib/crypto.js';
import { IntervalsClient } from './providers/intervals.js';
import { checkinsOf, deleteUser, intervalsTokenOf, teamAthleteIds, upsertCheckin, type CheckinRow } from './db/repo.js';
import { revokeAllSessions } from './sessions.js';
import type { AuthUser } from './auth.js';
import { downsampleStreams } from './lib/dashboards.js';
import type { ActivityStreams, CalendarEventPatch, IntervalsActivity, IntervalsActivityDetail, IntervalsAthlete, IntervalsEvent, IntervalsFolder, IntervalsPowerCurves, IntervalsStream, IntervalsWellness, NewCalendarEvent, NewWorkoutEvent } from './types.js';
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
  /** Phase C : événement quelconque (séance, compétition, note) et modification partielle. */
  createEvent(id: string, ev: NewCalendarEvent): Promise<IntervalsEvent>;
  updateEvent(id: string, eventId: string, patch: CalendarEventPatch): Promise<IntervalsEvent>;
  /** Phase D : streams complets d'une sortie, sans cache (stockés ensuite par l'app). */
  rawStreams(id: string, activityId: string): Promise<IntervalsStream[]>;
  activity(id: string, activityId: string): Promise<IntervalsActivityDetail>;
  /** Streams déjà réduits pour l'affichage (lib/dashboards.ts). */
  streams(id: string, activityId: string): Promise<ActivityStreams>;
  powerCurves(id: string): Promise<IntervalsPowerCurves>;
  /** Bibliothèque Intervals.icu (lecture seule). */
  folders(id: string): Promise<IntervalsFolder[]>;
  /** Écritures de la fiche profil (scopes SETTINGS:WRITE / WELLNESS:WRITE). */
  updateSportSettings(id: string, sport: 'Ride' | 'Run' | 'Swim', patch: { ftp?: number; lthr?: number; max_hr?: number; threshold_pace?: number }): Promise<void>;
  updateAthleteProfile(id: string, patch: { icu_weight?: number | null; icu_resting_hr?: number | null; sex?: string | null; height?: number | null; icu_date_of_birth?: string | null }): Promise<void>;
  updateWellness(id: string, day: string, patch: { weight?: number; restingHR?: number }): Promise<void>;
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
    createEvent: (id, ev) => client.createEvent(id, ev),
    updateEvent: (id, eventId, patch) => client.updateEvent(id, eventId, patch),
    rawStreams: (_id, activityId) => client.rawStreams(activityId),
    activity: (_id, activityId) => cachedJson(k('activity', activityId), TTL.activity, () => client.activity(activityId)),
    // Seule la version réduite est gardée (quelques Ko au lieu de centaines).
    streams: (_id, activityId) => cachedJson(k('streams', activityId), TTL.streams, async () => downsampleStreams(await client.streams(activityId))),
    powerCurves: (id) => cachedJson(k('powercurves'), TTL.powerCurve, () => client.powerCurves(id)),
    folders: (id) => cachedJson(k('folders'), TTL.library, () => client.folders(id)),
    // Une écriture rend obsolète la copie en cache (profil, forme du jour) : on la vide après succès.
    updateSportSettings: async (id, sport, patch) => {
      await client.updateSportSettings(id, sport, patch);
      await invalidateKeys(`icu:athlete:${athleteId}:*`);
    },
    updateAthleteProfile: async (id, patch) => {
      await client.updateAthleteProfile(id, patch);
      await invalidateKeys(`icu:athlete:${athleteId}:*`);
    },
    updateWellness: async (id, day, patch) => {
      await client.updateWellness(id, day, patch);
      await invalidateKeys(`icu:wellness:${athleteId}:*`);
    },
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
