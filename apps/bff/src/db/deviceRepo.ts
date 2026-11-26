import { db, affected } from './index.js';

/**
 * Requêtes des appareils reliés (migration 010) : connexion Wahoo, séances
 * poussées vers le compteur, sorties reçues par webhook. Toutes filtrées par
 * `user_id` (ou par identifiant externe unique) : la barrière d'isolation, comme
 * dans repo.ts. Les jetons restent chiffrés ici ; le déchiffrement est dans le service.
 */

export type DeviceProvider = 'wahoo' | 'garmin' | 'coros';

export interface ConnectionRow {
  provider: DeviceProvider;
  externalUserId: string;
  accessEnc: string;
  refreshEnc: string;
  expiresAt: Date;
  scope: string;
  connectedAt: Date;
  lastError: string | null;
}

/** Connexion sans jeton, pour l'affichage. */
export interface ConnectionInfo {
  provider: DeviceProvider;
  connectedAt: Date;
  lastError: string | null;
}

export interface PushRow {
  planId: string | null;
  workoutId: string | null;
  contentHash: string;
  status: 'pushed' | 'error' | 'skipped';
  error: string | null;
}

/** Séance du calendrier utile à l'envoi. */
export interface WorkoutEventRow {
  id: string;
  origin: 'app' | 'intervals';
  sport: string | null;
  day: string;
  name: string;
  description: string | null;
}

/** Sortie reçue d'un appareil, prête à être stockée (lib : service.ts). */
export interface DeviceActivityRow {
  id: string;
  source: 'wahoo';
  startUtc: string;
  startLocal: string;
  sport: string | null;
  typeRaw: string | null;
  name: string | null;
  movingSecs: number | null;
  distanceM: number | null;
  elevationM: number | null;
  avgHr: number | null;
  avgWatts: number | null;
  avgCadence: number | null;
}

interface ConnectionDb {
  user_id: string;
  provider: DeviceProvider;
  external_user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: Date;
  scope: string;
  connected_at: Date;
  last_error: string | null;
}

const toConnection = (r: ConnectionDb): ConnectionRow => ({
  provider: r.provider,
  externalUserId: r.external_user_id,
  accessEnc: r.access_token_enc,
  refreshEnc: r.refresh_token_enc,
  expiresAt: new Date(r.expires_at),
  scope: r.scope,
  connectedAt: new Date(r.connected_at),
  lastError: r.last_error,
});

/** Connexion d'un athlète à un fournisseur (jetons déjà chiffrés). Remplace la précédente. */
export async function saveConnection(
  userId: string,
  provider: DeviceProvider,
  c: { externalUserId: string; accessEnc: string; refreshEnc: string; expiresAt: Date; scope: string },
): Promise<void> {
  await db().query(
    `insert into device_connections (user_id, provider, external_user_id, access_token_enc, refresh_token_enc, expires_at, scope, connected_at, last_error)
     values ($1, $2, $3, $4, $5, $6, $7, now(), null)
     on conflict (user_id, provider) do update set
       external_user_id = excluded.external_user_id, access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc, expires_at = excluded.expires_at, scope = excluded.scope,
       connected_at = now(), last_error = null`,
    [userId, provider, c.externalUserId, c.accessEnc, c.refreshEnc, c.expiresAt.toISOString(), c.scope],
  );
}

export async function connectionOf(userId: string, provider: DeviceProvider): Promise<ConnectionRow | null> {
  const { rows } = await db().query<ConnectionDb>(
    `select user_id, provider, external_user_id, access_token_enc, refresh_token_enc, expires_at, scope, connected_at, last_error
     from device_connections where user_id = $1 and provider = $2`,
    [userId, provider],
  );
  return rows[0] ? toConnection(rows[0]) : null;
}

/** Connexions d'un athlète, sans jetons (affichage). */
export async function connectionsOf(userId: string): Promise<ConnectionInfo[]> {
  const { rows } = await db().query<{ provider: DeviceProvider; connected_at: Date; last_error: string | null }>(
    `select provider, connected_at, last_error from device_connections where user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({ provider: r.provider, connectedAt: new Date(r.connected_at), lastError: r.last_error }));
}

/** Utilisateur relié à ce compte externe (Wahoo `user.id`), ou null. */
export async function userOfExternal(provider: DeviceProvider, externalUserId: string): Promise<string | null> {
  const { rows } = await db().query<{ user_id: string }>(
    `select user_id from device_connections where provider = $1 and external_user_id = $2`,
    [provider, externalUserId],
  );
  return rows[0]?.user_id ?? null;
}

/** Nouveau couple de jetons après un rafraîchissement (chiffré). */
export async function updateTokens(userId: string, provider: DeviceProvider, c: { accessEnc: string; refreshEnc: string; expiresAt: Date }): Promise<void> {
  await db().query(
    `update device_connections set access_token_enc = $3, refresh_token_enc = $4, expires_at = $5, last_error = null
     where user_id = $1 and provider = $2`,
    [userId, provider, c.accessEnc, c.refreshEnc, c.expiresAt.toISOString()],
  );
}

export async function setConnectionError(userId: string, provider: DeviceProvider, message: string | null): Promise<void> {
  await db().query(`update device_connections set last_error = $3 where user_id = $1 and provider = $2`, [userId, provider, message?.slice(0, 300) ?? null]);
}

export async function deleteConnection(userId: string, provider: DeviceProvider): Promise<boolean> {
  return affected(await db().query(`delete from device_connections where user_id = $1 and provider = $2`, [userId, provider])) > 0;
}

/** Identifiants des athlètes reliés à ce fournisseur (pour le job d'envoi). */
export async function connectedUserIds(provider: DeviceProvider): Promise<string[]> {
  const { rows } = await db().query<{ user_id: string }>(`select user_id from device_connections where provider = $1`, [provider]);
  return rows.map((r) => r.user_id);
}

/* ---------- Séances poussées ---------- */

export async function pushOf(userId: string, provider: DeviceProvider, eventId: string): Promise<PushRow | null> {
  const { rows } = await db().query<{ plan_id: string | null; workout_id: string | null; content_hash: string; status: PushRow['status']; error: string | null }>(
    `select plan_id, workout_id, content_hash, status, error from device_pushes where user_id = $1 and provider = $2 and event_id = $3`,
    [userId, provider, eventId],
  );
  const r = rows[0];
  return r ? { planId: r.plan_id, workoutId: r.workout_id, contentHash: r.content_hash, status: r.status, error: r.error } : null;
}

export async function savePush(userId: string, provider: DeviceProvider, eventId: string, p: PushRow): Promise<void> {
  await db().query(
    `insert into device_pushes (user_id, provider, event_id, plan_id, workout_id, pushed_at, content_hash, status, error)
     values ($1, $2, $3, $4, $5, now(), $6, $7, $8)
     on conflict (user_id, provider, event_id) do update set
       plan_id = excluded.plan_id, workout_id = excluded.workout_id, pushed_at = now(),
       content_hash = excluded.content_hash, status = excluded.status, error = excluded.error`,
    [userId, provider, eventId, p.planId, p.workoutId, p.contentHash, p.status, p.error?.slice(0, 300) ?? null],
  );
}

export async function deletePush(userId: string, provider: DeviceProvider, eventId: string): Promise<void> {
  await db().query(`delete from device_pushes where user_id = $1 and provider = $2 and event_id = $3`, [userId, provider, eventId]);
}

/** Déconnexion : les identifiants de plans d'une autre autorisation ne servent plus. */
export async function deleteAllPushes(userId: string, provider: DeviceProvider): Promise<void> {
  await db().query(`delete from device_pushes where user_id = $1 and provider = $2`, [userId, provider]);
}

/** Nom et identifiant Intervals.icu d'un athlète (notifications), ou null. */
export async function athleteOfUser(userId: string): Promise<{ name: string; intervalsAthleteId: string } | null> {
  const { rows } = await db().query<{ name: string; intervals_athlete_id: string }>(`select name, intervals_athlete_id from users where id = $1`, [userId]);
  return rows[0] ? { name: rows[0].name, intervalsAthleteId: rows[0].intervals_athlete_id } : null;
}

/** Séances (kind = workout, toutes origines) d'un athlète dont le jour est entre `from` et `to`. */
export async function workoutEventsBetween(userId: string, from: string, to: string): Promise<WorkoutEventRow[]> {
  const { rows } = await db().query<{ id: string; origin: 'app' | 'intervals'; sport: string | null; day: string; name: string; description: string | null }>(
    `select id, origin, sport, to_char(day, 'YYYY-MM-DD') as day, name, description from calendar_events
     where user_id = $1 and kind = 'workout' and day between $2::date and $3::date order by day`,
    [userId, from, to],
  );
  return rows.map((r) => ({ id: r.id, origin: r.origin, sport: r.sport, day: r.day, name: r.name, description: r.description }));
}

/* ---------- Sorties reçues ---------- */

/** Une sortie Intervals.icu de cet athlète démarre-t-elle à moins de `windowMs` de `startUtc` ? */
export async function intervalsActivityNear(userId: string, startUtc: string, windowMs: number): Promise<boolean> {
  const t = new Date(startUtc).getTime();
  const { rows } = await db().query(
    `select 1 from activities where user_id = $1 and source = 'intervals' and start_utc between $2 and $3 limit 1`,
    [userId, new Date(t - windowMs).toISOString(), new Date(t + windowMs).toISOString()],
  );
  return rows.length > 0;
}

/** Enregistre une sortie reçue ; false si elle existe déjà (livraison en double du webhook). */
export async function insertDeviceActivity(userId: string, a: DeviceActivityRow): Promise<boolean> {
  const r = await db().query(
    `insert into activities (user_id, id, source, start_utc, start_local, sport, type_raw, name, moving_secs, distance_m, elevation_m,
                             avg_hr, avg_watts, avg_cadence, streams_status, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'none', now())
     on conflict (user_id, id) do nothing`,
    [userId, a.id, a.source, a.startUtc, a.startLocal, a.sport, a.typeRaw, a.name, a.movingSecs, a.distanceM, a.elevationM, a.avgHr, a.avgWatts, a.avgCadence],
  );
  return affected(r) > 0;
}
