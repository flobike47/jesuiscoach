import { affected, db } from './index.js';

/**
 * Toutes les requêtes SQL du BFF. Règles :
 *  - requêtes paramétrées uniquement ;
 *  - toute lecture / écriture liée à un utilisateur est filtrée par son id
 *    (ou par le lien coach → athlète) : c'est la seule barrière d'isolation ;
 *  - colonnes explicites, jamais `select *` vers une réponse API.
 */

export type Role = 'coach' | 'athlete';

export interface UserRow {
  id: string;
  intervals_athlete_id: string;
  name: string;
  role: Role;
}

const USER_COLS = 'u.id, u.intervals_athlete_id, u.name, u.role';

/* ---------- Utilisateurs ---------- */

export async function findUserByAthlete(athleteId: string): Promise<UserRow | null> {
  const { rows } = await db().query<UserRow>(`select ${USER_COLS} from users u where u.intervals_athlete_id = $1`, [athleteId]);
  return rows[0] ?? null;
}

/**
 * Crée l'utilisateur à sa première connexion, ou met à jour son nom. Le rôle
 * d'un compte existant n'est jamais rétrogradé ici ; `promoteToCoach`
 * l'élève quand l'ID figure dans COACH_ATHLETE_IDS.
 */
export async function upsertUser(athleteId: string, name: string, promoteToCoach: boolean): Promise<UserRow> {
  const { rows } = await db().query<UserRow>(
    `insert into users as u (intervals_athlete_id, name, role)
     values ($1, $2, case when $3 then 'coach' else 'athlete' end)
     on conflict (intervals_athlete_id) do update
       set name = excluded.name,
           role = case when $3 then 'coach' else u.role end
     returning ${USER_COLS}`,
    [athleteId, name, promoteToCoach],
  );
  return rows[0];
}

/* ---------- Jetons Intervals.icu (chiffrés) ---------- */

export async function saveIntervalsToken(userId: string, tokenEnc: string, scope: string): Promise<void> {
  await db().query(
    `insert into intervals_tokens (user_id, access_token_enc, scope, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id) do update set access_token_enc = excluded.access_token_enc, scope = excluded.scope, updated_at = now()`,
    [userId, tokenEnc, scope],
  );
}

export async function intervalsTokenOf(athleteId: string): Promise<string | null> {
  const { rows } = await db().query<{ access_token_enc: string }>(
    `select t.access_token_enc from intervals_tokens t join users u on u.id = t.user_id where u.intervals_athlete_id = $1`,
    [athleteId],
  );
  return rows[0]?.access_token_enc ?? null;
}

/* ---------- Sessions ---------- */

export async function insertSession(tokenHash: string, userId: string, expiresAt: Date, userAgent: string | null): Promise<void> {
  await db().query(`insert into sessions (token_hash, user_id, expires_at, user_agent) values ($1, $2, $3, $4)`, [
    tokenHash,
    userId,
    expiresAt.toISOString(),
    userAgent,
  ]);
}

/** Utilisateur d'une session encore valide. */
export async function userOfSession(tokenHash: string): Promise<UserRow | null> {
  const { rows } = await db().query<UserRow>(
    `select ${USER_COLS} from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await db().query('delete from sessions where token_hash = $1', [tokenHash]);
}

export async function purgeExpiredSessions(): Promise<number> {
  return affected(await db().query('delete from sessions where expires_at <= now()'));
}

/* ---------- Équipe ---------- */

/** IDs Intervals des athlètes suivis par ce coach. */
export async function teamAthleteIds(coachId: string): Promise<string[]> {
  const { rows } = await db().query<{ intervals_athlete_id: string }>(
    `select u.intervals_athlete_id from coach_athletes ca join users u on u.id = ca.athlete_id
     where ca.coach_id = $1 order by u.name`,
    [coachId],
  );
  return rows.map((r) => r.intervals_athlete_id);
}

export async function linkCoachAthlete(coachId: string, athleteId: string): Promise<void> {
  await db().query(`insert into coach_athletes (coach_id, athlete_id) values ($1, $2) on conflict do nothing`, [coachId, athleteId]);
}

/* ---------- Invitations ---------- */

export async function insertInvitation(code: string, coachId: string, expiresAt: Date): Promise<void> {
  await db().query('insert into invitations (code, coach_id, expires_at) values ($1, $2, $3)', [code, coachId, expiresAt.toISOString()]);
}

/**
 * Consomme une invitation valide (non expirée, jamais utilisée) en une seule
 * instruction : deux inscriptions simultanées avec le même lien ne peuvent
 * pas réussir toutes les deux. Renvoie le coach, ou null.
 */
export async function consumeInvitation(code: string, userId: string): Promise<string | null> {
  const { rows } = await db().query<{ coach_id: string }>(
    `update invitations set used_by = $2, used_at = now()
     where code = $1 and used_by is null and expires_at > now()
     returning coach_id`,
    [code, userId],
  );
  return rows[0]?.coach_id ?? null;
}

/** Invitation encore utilisable ? (vérifié avant de créer le compte) */
export async function invitationIsValid(code: string): Promise<boolean> {
  const { rows } = await db().query('select 1 from invitations where code = $1 and used_by is null and expires_at > now()', [code]);
  return rows.length > 0;
}

/* ---------- Notifications push ---------- */

export interface PushSubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Upsert sur l'endpoint : réabonner le même navigateur ne crée pas de
 * doublon, et un autre compte connecté sur cet appareil le récupère.
 */
export async function upsertPushSubscription(userId: string, sub: PushSubRow, userAgent: string | null): Promise<void> {
  await db().query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [userId, sub.endpoint, sub.p256dh, sub.auth, userAgent],
  );
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db().query('delete from push_subscriptions where user_id = $1 and endpoint = $2', [userId, endpoint]);
}

export async function pushSubscriptionsOf(userId: string): Promise<PushSubRow[]> {
  const { rows } = await db().query<PushSubRow>('select endpoint, p256dh, auth from push_subscriptions where user_id = $1', [userId]);
  return rows;
}

/** Annule une inscription incomplète (invitation consommée entre-temps par quelqu'un d'autre). */
export async function deleteUser(userId: string): Promise<void> {
  await db().query('delete from users where id = $1', [userId]);
}
