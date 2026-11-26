import { createHash } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { fromProfile, addDays } from '../activityStore.js';
import { config } from '../config.js';
import { redis } from '../cache.js';
import { decrypt, encrypt, parseKey, pkcePair, randomToken } from '../lib/crypto.js';
import { parisToday } from '../lib/calendar.js';
import type { Sport } from '../lib/sport.js';
import { dbProfileStore } from '../db/profileRepo.js';
import * as activities from '../db/activityRepo.js';
import type { ComputedRecord } from '../db/activityRepo.js';
import * as devices from '../db/deviceRepo.js';
import { coachesOf, markActivitiesSeen } from '../db/repo.js';
import { pushNotify, rideNotification, type Notify } from '../jobs/sync.js';
import { ProviderError } from '../providers/http.js';
import { HttpError } from '../validation.js';
import { authorizeUrl, WahooClient, WAHOO_WORKOUT_TYPE_ID, type WahooCredentials } from './wahoo.js';
import { buildWahooPlan, type PlanThresholds } from './wahooPlan.js';

/**
 * Appareils reliés directement à l'app (phase E, docs/plans/E-appareils-wahoo.md).
 *  - Connexion Wahoo : OAuth + PKCE, state à usage unique dans Redis (10 min).
 *  - Envoi : une séance du calendrier de l'app (kind = workout, origine app, sport
 *    Ride ou Run) devient un plan + une séance planifiée sur le compteur, quand elle
 *    tombe entre aujourd'hui et J+6 (heure de Paris). Le job horaire (jobs/devicePush.ts)
 *    rattrape les séances qui entrent dans la fenêtre.
 *  - Réception : les résumés de sortie (webhook) entrent dans la copie des sorties.
 * Règle : une erreur d'appareil n'est jamais bloquante pour le calendrier ni pour
 * le BFF ; elle est enregistrée (device_pushes.error, device_connections.last_error).
 */

const PROVIDER: devices.DeviceProvider = 'wahoo';
const STATE_TTL = 10 * 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const RECONNECT_MSG = 'Reconnexion Wahoo nécessaire';
/** Heure de départ planifiée sur le compteur (heure de Paris). */
const START_HOUR = 7;
/** Fenêtre d'envoi : aujourd'hui + 6 jours (affichage sur le compteur). */
const WINDOW_DAYS = 6;
/** Tolérance pour apparier une sortie Wahoo à une sortie Intervals.icu déjà copiée. */
const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;

export class NeedsReconnect extends Error {
  constructor() {
    super(RECONNECT_MSG);
  }
}

/** Wahoo non configuré sur ce serveur (pas d'app validée) : tout reste désactivé. */
export function wahooConfigured(): boolean {
  return Boolean(config.wahooClientId && config.wahooClientSecret && config.tokenEncryptionKey);
}

function credentials(): WahooCredentials {
  if (!config.wahooClientId || !config.wahooClientSecret) throw new HttpError(503, 'Connexion Wahoo non configurée sur ce serveur');
  return { clientId: config.wahooClientId, clientSecret: config.wahooClientSecret };
}

function client(): WahooClient {
  return new WahooClient(credentials());
}

function key(): Buffer {
  if (!config.tokenEncryptionKey) throw new HttpError(503, 'Chiffrement des jetons non configuré');
  return parseKey(config.tokenEncryptionKey);
}

export const wahooRedirectUri = () => `${config.publicApiUrl.replace(/\/$/, '')}/api/public/devices/wahoo/callback`;

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function shortError(err: unknown): string {
  if (err instanceof NeedsReconnect) return RECONNECT_MSG;
  if (err instanceof ProviderError) return err.message.slice(0, 300);
  if (err instanceof HttpError) return err.message.slice(0, 300);
  return 'Envoi vers Wahoo impossible';
}

/* ---------- Heure de Paris ---------- */

/** Date et heure locales de Paris d'un instant, au format AAAA-MM-JJTHH:MM:SS. */
export function parisLocal(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Heure de Paris d'un jour (AAAA-MM-JJ) convertie en instant UTC ISO 8601. */
export function parisDayTimeToUtc(day: string, hour: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  // Écart entre l'heure de Paris et UTC à cet instant (heure d'été / d'hiver).
  const offset = Date.parse(`${parisLocal(new Date(guess))}Z`) - guess;
  return new Date(guess - offset).toISOString();
}

/* ---------- Jetons ---------- */

const refreshing = new Map<string, Promise<string>>();

/** Jeton d'accès valide pour cet utilisateur ; rafraîchit si besoin (un seul rafraîchissement à la fois). */
export function accessToken(userId: string): Promise<string> {
  let pending = refreshing.get(userId);
  if (!pending) {
    pending = freshAccessToken(userId).finally(() => refreshing.delete(userId));
    refreshing.set(userId, pending);
  }
  return pending;
}

async function freshAccessToken(userId: string): Promise<string> {
  const conn = await devices.connectionOf(userId, PROVIDER);
  if (!conn) throw new HttpError(409, 'Wahoo non relié');
  const k = key();
  if (conn.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) return decrypt(conn.accessEnc, k);
  let tokens;
  try {
    tokens = await client().refresh(decrypt(conn.refreshEnc, k));
  } catch (err) {
    if (err instanceof ProviderError && (err.status === 401 || err.status === 403)) {
      await devices.setConnectionError(userId, PROVIDER, RECONNECT_MSG);
      throw new NeedsReconnect();
    }
    throw err;
  }
  // Wahoo révoque l'ancien couple dès le premier appel : on enregistre le nouveau avant tout usage.
  await devices.updateTokens(userId, PROVIDER, { accessEnc: encrypt(tokens.accessToken, k), refreshEnc: encrypt(tokens.refreshToken, k), expiresAt: tokens.expiresAt });
  return tokens.accessToken;
}

/* ---------- Connexion ---------- */

interface PendingConnect {
  userId: string;
  verifier: string;
}

/** Démarre la connexion : renvoie l'URL d'autorisation Wahoo. */
export async function connectWahoo(userId: string): Promise<string> {
  const creds = credentials();
  if (!config.tokenEncryptionKey) throw new HttpError(503, 'Chiffrement des jetons non configuré');
  const state = randomToken();
  const { verifier, challenge } = pkcePair();
  await redis.setex(`device:wahoo:${state}`, STATE_TTL, JSON.stringify({ userId, verifier } satisfies PendingConnect));
  return authorizeUrl({ clientId: creds.clientId, redirectUri: wahooRedirectUri(), state, challenge });
}

/** Retour de Wahoo : renvoie « ok » ou un code d'erreur court pour le web. */
export async function finishWahoo(state: string, code: string): Promise<'ok' | 'session_expiree' | 'echange_refuse' | 'compte_deja_relie'> {
  const raw = await redis.getdel(`device:wahoo:${state}`);
  if (!raw) return 'session_expiree';
  const pending = JSON.parse(raw) as PendingConnect;
  const api = client();
  let tokens;
  let wahooId;
  try {
    tokens = await api.exchangeCode(code, pending.verifier, wahooRedirectUri());
    wahooId = await api.userId(tokens.accessToken);
  } catch {
    return 'echange_refuse';
  }
  const owner = await devices.userOfExternal(PROVIDER, wahooId);
  if (owner && owner !== pending.userId) return 'compte_deja_relie';
  const k = key();
  try {
    await devices.saveConnection(pending.userId, PROVIDER, {
      externalUserId: wahooId,
      accessEnc: encrypt(tokens.accessToken, k),
      refreshEnc: encrypt(tokens.refreshToken, k),
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });
  } catch (err) {
    // Index unique (fournisseur, identifiant externe) : compte déjà relié ailleurs.
    if ((err as { code?: string }).code === '23505') return 'compte_deja_relie';
    throw err;
  }
  return 'ok';
}

/** Déconnexion : révocation au mieux chez Wahoo, puis suppression locale. */
export async function disconnectWahoo(userId: string): Promise<void> {
  if (wahooConfigured() && (await devices.connectionOf(userId, PROVIDER))) {
    try {
      await client().revoke(await accessToken(userId));
    } catch {
      // Déjà révoqué ou Wahoo indisponible : on supprime quand même la connexion locale.
    }
  }
  await devices.deleteAllPushes(userId, PROVIDER);
  await devices.deleteConnection(userId, PROVIDER);
}

export interface DeviceStatus {
  provider: devices.DeviceProvider;
  label: string;
  /** Lien direct avec le fournisseur (sinon : via Intervals.icu). */
  direct: boolean;
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  lastError: string | null;
}

/** État des appareils d'un athlète (null : athlète sans compte connecté). */
export async function deviceStatus(userId: string | null): Promise<DeviceStatus[]> {
  const conns = userId && !config.demoMode ? await devices.connectionsOf(userId) : [];
  const wahoo = conns.find((c) => c.provider === 'wahoo');
  return [
    {
      provider: 'wahoo',
      label: 'Wahoo',
      direct: true,
      configured: wahooConfigured(),
      connected: Boolean(wahoo),
      connectedAt: wahoo?.connectedAt.toISOString() ?? null,
      lastError: wahoo?.lastError ?? null,
    },
    { provider: 'garmin', label: 'Garmin', direct: false, configured: false, connected: false, connectedAt: null, lastError: null },
    { provider: 'coros', label: 'Coros', direct: false, configured: false, connected: false, connectedAt: null, lastError: null },
  ];
}

/* ---------- Envoi des séances ---------- */

/** Champs d'une ligne du calendrier utiles à l'envoi. */
export interface PushableEvent {
  id: string;
  kind: 'workout' | 'race' | 'note';
  origin: 'app' | 'intervals';
  sport: Sport | null;
  day: string;
  name: string;
  description: string | null;
}

/** Seuils de la fiche profil pour cette séance ; absents = conversion refusée (raison affichée). */
async function thresholdsOf(userId: string, sport: Sport): Promise<PlanThresholds> {
  const profile = await dbProfileStore(userId).load();
  const th = profile ? fromProfile(profile) : null;
  return { ftp: th?.Ride.ftp ?? null, lthr: th ? th[sport].lthr : null, thresholdSpeed: th?.Run.thresholdSpeed ?? null };
}

/** Premier jour et dernier jour de la fenêtre d'envoi (heure de Paris). */
export function pushWindow(now: Date): { from: string; to: string } {
  const from = parisToday(now);
  return { from, to: addDays(from, WINDOW_DAYS) };
}

/**
 * Envoie (ou met à jour) une séance vers Wahoo. Ne lève jamais : l'échec est
 * enregistré dans device_pushes. Ne fait rien si la séance n'est pas dans la
 * fenêtre ou si son contenu n'a pas changé depuis le dernier envoi.
 */
export async function pushEvent(userId: string, ev: PushableEvent, now = new Date()): Promise<void> {
  if (!wahooConfigured() || config.demoMode) return;
  if (ev.kind !== 'workout' || ev.origin !== 'app' || !ev.sport) return;
  const win = pushWindow(now);
  if (ev.day < win.from || ev.day > win.to) return;
  if (!(await devices.connectionOf(userId, PROVIDER))) return;

  const prev = await devices.pushOf(userId, PROVIDER, ev.id);
  let planId = prev?.planId ?? null;
  let workoutId = prev?.workoutId ?? null;
  try {
    if (ev.sport === 'Swim') {
      const hash = digest(['skip', ev.sport, ev.name, ev.description, ev.day]);
      if (prev?.contentHash === hash && prev.status === 'skipped') return;
      await devices.savePush(userId, PROVIDER, ev.id, { planId, workoutId, contentHash: hash, status: 'skipped', error: 'natation non prise en charge' });
      return;
    }
    const built = buildWahooPlan({
      sport: ev.sport,
      name: ev.name,
      description: ev.description,
      text: ev.description ?? '',
      thresholds: await thresholdsOf(userId, ev.sport),
    });
    if (!built.ok) {
      const hash = digest(['skip', ev.sport, ev.name, ev.description, ev.day, built.reason]);
      if (prev?.contentHash === hash && prev.status === 'skipped') return;
      await devices.savePush(userId, PROVIDER, ev.id, { planId, workoutId, contentHash: hash, status: 'skipped', error: built.reason });
      return;
    }

    const starts = parisDayTimeToUtc(ev.day, START_HOUR);
    const hash = digest({ plan: built.plan, starts, minutes: built.minutes });
    if (prev?.contentHash === hash && prev.status === 'pushed') return;

    const token = await accessToken(userId);
    const api = client();
    const payload = { plan: built.plan, filename: `seance-${ev.id}.json`, externalId: ev.id, providedUpdatedAt: new Date().toISOString() };
    if (planId) {
      try {
        await api.updatePlan(token, planId, payload);
      } catch (err) {
        // Plan supprimé côté Wahoo : on le recrée.
        if (!(err instanceof ProviderError && err.status === 404)) throw err;
        planId = null;
        workoutId = null;
      }
    }
    if (!planId) planId = await api.createPlan(token, payload);
    if (!workoutId) {
      workoutId = await api.createWorkout(token, {
        name: ev.name,
        workoutToken: ev.id,
        workoutTypeId: WAHOO_WORKOUT_TYPE_ID[ev.sport],
        starts,
        minutes: built.minutes,
        planId,
      });
    }
    await devices.savePush(userId, PROVIDER, ev.id, { planId, workoutId, contentHash: hash, status: 'pushed', error: null });
  } catch (err) {
    const reconnect = err instanceof NeedsReconnect || (err instanceof ProviderError && err.status === 401);
    if (reconnect) await devices.setConnectionError(userId, PROVIDER, RECONNECT_MSG).catch(() => undefined);
    await devices.savePush(userId, PROVIDER, ev.id, {
      planId,
      workoutId,
      contentHash: digest(['error', ev.id, ev.day, ev.name, ev.description]),
      status: 'error',
      error: shortError(err),
    });
  }
}

/** Retire la séance du compteur (au mieux : l'échec n'empêche pas la suppression locale). */
export async function removePushed(userId: string, eventId: string): Promise<void> {
  if (!wahooConfigured() || config.demoMode) return;
  const prev = await devices.pushOf(userId, PROVIDER, eventId);
  if (!prev?.planId) return;
  try {
    await client().deletePlan(await accessToken(userId), prev.planId);
  } catch {
    // Le plan reste sur le compteur : l'athlète peut le retirer à la main.
  }
  await devices.deletePush(userId, PROVIDER, eventId);
}

/** Envoie les séances de la fenêtre d'un athlète relié (job horaire et rattrapage). */
export async function pushDue(userId: string, now = new Date()): Promise<number> {
  if (!wahooConfigured() || config.demoMode) return 0;
  const win = pushWindow(now);
  const events = await devices.workoutEventsBetween(userId, win.from, win.to);
  let count = 0;
  for (const e of events) {
    const sport = e.sport === 'Ride' || e.sport === 'Run' || e.sport === 'Swim' ? e.sport : null;
    await pushEvent(userId, { id: e.id, kind: 'workout', origin: e.origin, sport, day: e.day, name: e.name, description: e.description }, now);
    count++;
  }
  return count;
}

/**
 * Point d'entrée depuis le calendrier : athlète identifié par son id Intervals.icu.
 * Sans effet hors Wahoo connecté. Les appelants ignorent l'erreur (jamais bloquante).
 */
export async function syncEventToDevices(athleteId: string, ev: PushableEvent): Promise<void> {
  if (!wahooConfigured() || config.demoMode) return;
  const userId = await activities.userIdOfAthlete(athleteId);
  if (userId) await pushEvent(userId, ev);
}

export async function removeEventFromDevices(athleteId: string, eventId: string): Promise<void> {
  if (!wahooConfigured() || config.demoMode) return;
  const userId = await activities.userIdOfAthlete(athleteId);
  if (userId) await removePushed(userId, eventId);
}

/* ---------- Réception des sorties ---------- */

/** Résumé d'une sortie tel que le webhook Wahoo l'envoie (décimales en chaînes). */
export interface WahooSummary {
  id?: unknown;
  power_avg?: unknown;
  power_bike_np_last?: unknown;
  heart_rate_avg?: unknown;
  distance_accum?: unknown;
  duration_active_accum?: unknown;
  ascent_accum?: unknown;
  cadence_avg?: unknown;
  workout?: { id?: unknown; starts?: unknown; name?: unknown; workout_type_id?: unknown } | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const bounded = (v: number | null, max: number, digits = 0): number | null => {
  if (v == null || v < 0 || v > max) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/**
 * Charge et intensité, comme l'app (lib/workout.ts) : intensité = puissance
 * pondérée / FTP, charge = heures × intensité² × 100. Sans puissance ou sans FTP :
 * rien (la méthode « none » le signale). La charge Wahoo (TSS) n'est pas reprise.
 */
function loadOf(weighted: number | null, movingSecs: number | null, ftp: number | null) {
  if (!weighted || !ftp || !movingSecs) return { intensity: null, load: null, loadMethod: 'none' as const };
  const intensity = Math.round((weighted / ftp) * 1000) / 1000;
  if (intensity > 9.999) return { intensity: null, load: null, loadMethod: 'none' as const };
  const load = Math.round((movingSecs / 3600) * intensity * intensity * 1000) / 10;
  return { intensity, load, loadMethod: 'power' as const };
}

/** Sortie Wahoo prête à enregistrer (id `wahoo-<id>`), ou null si le résumé est inexploitable. */
export function wahooActivityOf(s: WahooSummary, ftp: number | null) {
  const summaryId = typeof s.id === 'string' || typeof s.id === 'number' ? String(s.id) : null;
  const starts = typeof s.workout?.starts === 'string' ? s.workout.starts : null;
  if (!summaryId || !starts || Number.isNaN(Date.parse(starts))) return null;
  const moving = bounded(num(s.duration_active_accum), 2_000_000);
  const np = bounded(num(s.power_bike_np_last), 32_767);
  const load = loadOf(np, moving, ftp);
  const id = `wahoo-${summaryId}`.slice(0, 64);
  const row: devices.DeviceActivityRow = {
    id,
    source: 'wahoo',
    startUtc: new Date(starts).toISOString(),
    startLocal: parisLocal(new Date(starts)),
    sport: null,
    typeRaw: s.workout?.workout_type_id != null ? String(s.workout.workout_type_id).slice(0, 40) : null,
    name: typeof s.workout?.name === 'string' ? s.workout.name.slice(0, 200) : null,
    movingSecs: moving,
    distanceM: bounded(num(s.distance_accum), 9_999_999.9, 1),
    elevationM: bounded(num(s.ascent_accum), 999_999.9, 1),
    avgHr: bounded(num(s.heart_rate_avg), 32_767),
    avgWatts: bounded(num(s.power_avg), 32_767),
    avgCadence: bounded(num(s.cadence_avg), 32_767),
  };
  const computed: ComputedRecord = {
    weightedWatts: np,
    intensity: load.intensity,
    load: load.load,
    loadMethod: load.loadMethod,
    ftpUsed: ftp,
    lthrUsed: null,
    powerZoneSecs: null,
    hrZoneSecs: null,
    bests: [],
  };
  return { row, computed };
}

export type ReceiveResult = 'recue' | 'deja_recue' | 'doublon' | 'ignoree';

/**
 * Enregistre une sortie reçue d'un appareil : copie dans les sorties, puis une
 * seule notification aux coachs. Doublon avec une sortie Intervals.icu proche
 * (± 3 min) : la copie Intervals.icu fait foi, rien n'est créé.
 */
export async function receiveWahooSummary(userId: string, summary: WahooSummary, log: FastifyBaseLogger, notify: Notify = pushNotify(log)): Promise<ReceiveResult> {
  const profile = await dbProfileStore(userId).load();
  const ftp = profile ? fromProfile(profile).Ride.ftp : null;
  const built = wahooActivityOf(summary, ftp);
  if (!built) return 'ignoree';
  const { row, computed } = built;
  if (await devices.intervalsActivityNear(userId, row.startUtc, DUPLICATE_WINDOW_MS)) return 'doublon';
  if (!(await devices.insertDeviceActivity(userId, row))) return 'deja_recue';
  await activities.saveComputed(userId, row.id, computed, 'none');

  const fresh = await markActivitiesSeen(userId, [row.id]);
  const athlete = await devices.athleteOfUser(userId);
  const coaches = fresh.length && athlete ? await coachesOf(userId) : [];
  if (athlete && coaches.length) {
    await notify(
      coaches,
      rideNotification(athlete.name, athlete.intervalsAthleteId, {
        id: row.id,
        start_date_local: row.startLocal,
        name: row.name ?? undefined,
        moving_time: row.movingSecs,
        distance: row.distanceM,
        icu_training_load: computed.load,
      }),
    );
  }
  return 'recue';
}
