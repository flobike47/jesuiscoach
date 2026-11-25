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

/** Supprime toutes les sessions d'un utilisateur et renvoie leurs empreintes (pour vider le cache). */
export async function deleteSessionsOf(userId: string): Promise<string[]> {
  const { rows } = await db().query<{ token_hash: string }>('delete from sessions where user_id = $1 returning token_hash', [userId]);
  return rows.map((r) => r.token_hash);
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

/** Supprime un utilisateur et, en cascade, toutes ses données (compte supprimé, ou inscription annulée). */
export async function deleteUser(userId: string): Promise<void> {
  await db().query('delete from users where id = $1', [userId]);
}

/* ---------- Synchro des sorties ---------- */

export interface SyncTarget {
  id: string;
  intervals_athlete_id: string;
  name: string;
  initialized: boolean;
  /** Création du compte : une sortie importée après est nouvelle, même à la première synchro. */
  created_at: Date | string;
}

/** Athlètes à synchroniser : ceux qui ont connecté Intervals.icu. */
export async function syncTargets(): Promise<SyncTarget[]> {
  const { rows } = await db().query<SyncTarget>(
    `select u.id, u.intervals_athlete_id, u.name, u.created_at, (s.user_id is not null) as initialized
     from users u join intervals_tokens t on t.user_id = u.id
     left join sync_state s on s.user_id = u.id
     order by u.id`,
  );
  return rows;
}

/** Cible de synchro d'un athlète précis (webhook), ou null s'il n'est pas connecté. */
export async function syncTargetOf(athleteId: string): Promise<SyncTarget | null> {
  const { rows } = await db().query<SyncTarget>(
    `select u.id, u.intervals_athlete_id, u.name, u.created_at, (s.user_id is not null) as initialized
     from users u join intervals_tokens t on t.user_id = u.id
     left join sync_state s on s.user_id = u.id
     where u.intervals_athlete_id = $1`,
    [athleteId],
  );
  return rows[0] ?? null;
}

/**
 * Marque des sorties comme vues et renvoie celles qui ne l'étaient pas.
 * Une seule instruction : deux synchros concurrentes ne peuvent pas
 * renvoyer la même sortie (donc pas de double notification).
 */
export async function markActivitiesSeen(userId: string, activityIds: string[]): Promise<string[]> {
  if (activityIds.length === 0) return [];
  const { rows } = await db().query<{ activity_id: string }>(
    `insert into seen_activities (user_id, activity_id)
     select $1, unnest($2::text[])
     on conflict do nothing
     returning activity_id`,
    [userId, activityIds],
  );
  return rows.map((r) => r.activity_id);
}

export async function recordSync(userId: string, error: string | null): Promise<void> {
  await db().query(
    `insert into sync_state (user_id, last_sync_at, last_error) values ($1, now(), $2)
     on conflict (user_id) do update set last_sync_at = now(), last_error = excluded.last_error`,
    [userId, error?.slice(0, 500) ?? null],
  );
}

/** Ménage : les sorties vues il y a plus de 30 jours ne reviendront plus dans la fenêtre de synchro. */
export async function purgeSeenActivities(): Promise<number> {
  return affected(await db().query(`delete from seen_activities where seen_at < now() - interval '30 days'`));
}

/** Coachs d'un athlète (destinataires de ses notifications). */
export async function coachesOf(athleteUserId: string): Promise<string[]> {
  const { rows } = await db().query<{ coach_id: string }>('select coach_id from coach_athletes where athlete_id = $1', [athleteUserId]);
  return rows.map((r) => r.coach_id);
}

/**
 * Remplace l'ensemble des alertes actives d'un athlète et renvoie celles qui
 * viennent d'apparaître (à notifier). Transaction : lecture et écriture cohérentes.
 */
export async function updateActiveAlerts(userId: string, codes: string[]): Promise<string[]> {
  return db().transaction(async (tx) => {
    await tx.query('delete from active_alerts where user_id = $1 and not (code = any($2::text[]))', [userId, codes]);
    if (codes.length === 0) return [];
    const { rows } = await tx.query<{ code: string }>(
      `insert into active_alerts (user_id, code) select $1, unnest($2::text[]) on conflict do nothing returning code`,
      [userId, codes],
    );
    return rows.map((r) => r.code);
  });
}

export async function activeAlertCodes(userId: string): Promise<string[]> {
  const { rows } = await db().query<{ code: string }>('select code from active_alerts where user_id = $1', [userId]);
  return rows.map((r) => r.code);
}

/* ---------- Ressenti ---------- */

export interface CheckinRow {
  day: string;
  feeling: number;
  rpe: number | null;
  note: string | null;
}

export async function upsertCheckin(userId: string, c: CheckinRow): Promise<void> {
  await db().query(
    `insert into checkins (user_id, day, feeling, rpe, note, updated_at) values ($1, $2, $3, $4, $5, now())
     on conflict (user_id, day) do update set feeling = excluded.feeling, rpe = excluded.rpe, note = excluded.note, updated_at = now()`,
    [userId, c.day, c.feeling, c.rpe, c.note],
  );
}

/** Ressentis d'un athlète (par ID Intervals) entre deux dates, du plus récent au plus ancien. */
export async function checkinsOf(athleteId: string, from: string, to: string): Promise<CheckinRow[]> {
  const { rows } = await db().query<CheckinRow>(
    `select to_char(c.day, 'YYYY-MM-DD') as day, c.feeling, c.rpe, c.note
     from checkins c join users u on u.id = c.user_id
     where u.intervals_athlete_id = $1 and c.day between $2 and $3
     order by c.day desc`,
    [athleteId, from, to],
  );
  return rows;
}

/* ---------- Mode démo ---------- */

/**
 * Crée (ou remet d'aplomb) les deux comptes démo en base, pour que les
 * notifications puissent s'y abonner. Appelé au démarrage UNIQUEMENT en
 * DEMO_MODE (index.ts) ; ids fixes, sans jeton Intervals (donc jamais synchronisés).
 */
export async function ensureDemoUsers(coach: { id: string; athleteId: string; name: string }, athlete: { id: string; athleteId: string; name: string }): Promise<void> {
  await db().transaction(async (tx) => {
    for (const [u, role] of [[coach, 'coach'], [athlete, 'athlete']] as const) {
      await tx.query(
        `insert into users (id, intervals_athlete_id, name, role) values ($1, $2, $3, $4)
         on conflict (id) do update set intervals_athlete_id = excluded.intervals_athlete_id, name = excluded.name, role = excluded.role`,
        [u.id, u.athleteId, u.name, role],
      );
    }
    await tx.query('insert into coach_athletes (coach_id, athlete_id) values ($1, $2) on conflict do nothing', [coach.id, athlete.id]);
  });
}
