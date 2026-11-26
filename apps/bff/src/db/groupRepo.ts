import { affected, db } from './index.js';

/**
 * Requêtes SQL pour les groupes d'athlètes (phase E).
 * Toutes les requêtes sont filtrées par coach_user_id : c'est la seule barrière
 * d'isolation (pas de RLS). Aucun appel sans ce filtre n'est accepté.
 */

export interface GroupRow {
  id: string;
  coach_user_id: string;
  name: string;
  created_at: string;
}

export interface GroupWithMembers {
  id: string;
  name: string;
  athleteIds: string[];
}

/* ---------- Lecture ---------- */

/** Tous les groupes d'un coach avec leurs membres. */
export async function listGroupsOf(coachId: string): Promise<GroupWithMembers[]> {
  const { rows } = await db().query<{ id: string; name: string; athlete_id: string }>(
    `select g.id, g.name, m.athlete_id
     from athlete_groups g
     left join athlete_group_members m on m.group_id = g.id
     where g.coach_user_id = $1
     order by g.created_at, g.name`,
    [coachId],
  );

  const map = new Map<string, GroupWithMembers>();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, { id: row.id, name: row.name, athleteIds: [] });
    }
    if (row.athlete_id) {
      map.get(row.id)!.athleteIds.push(row.athlete_id);
    }
  }
  return Array.from(map.values());
}

/** Un groupe avec ses membres, ou null si absent ou appartient à un autre coach. */
export async function getGroup(coachId: string, groupId: string): Promise<GroupWithMembers | null> {
  const { rows } = await db().query<{ id: string; name: string; athlete_id: string }>(
    `select g.id, g.name, m.athlete_id
     from athlete_groups g
     left join athlete_group_members m on m.group_id = g.id
     where g.id = $1 and g.coach_user_id = $2`,
    [groupId, coachId],
  );

  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    id: first.id,
    name: first.name,
    athleteIds: rows.filter((r) => r.athlete_id).map((r) => r.athlete_id),
  };
}

/* ---------- Écriture ---------- */

/** Crée un groupe vide. */
export async function insertGroup(coachId: string, name: string): Promise<GroupWithMembers> {
  const { rows } = await db().query<{ id: string; name: string }>(
    `insert into athlete_groups (coach_user_id, name) values ($1, $2)
     returning id, name`,
    [coachId, name],
  );
  const row = rows[0];
  return { id: row.id, name: row.name, athleteIds: [] };
}

/** Met à jour le nom d'un groupe (ou ses membres si athleteIds est passé). */
export async function updateGroup(
  coachId: string,
  groupId: string,
  name: string | undefined,
  athleteIds: string[] | undefined,
): Promise<GroupWithMembers> {
  // Garde d'isolation : on ne touche aux membres que d'un groupe de ce coach.
  if (!(await getGroup(coachId, groupId))) throw new Error('Group not found or not owned by this coach');
  if (name !== undefined) {
    await db().query(`update athlete_groups set name = $1 where id = $2 and coach_user_id = $3`, [name, groupId, coachId]);
  }

  if (athleteIds !== undefined) {
    // Remplacer les membres : d'abord supprimer tous, puis insérer les nouveaux
    await db().query(`delete from athlete_group_members where group_id = $1`, [groupId]);
    if (athleteIds.length > 0) {
      const values = athleteIds.map((_, i) => `($1, $${i + 2})`).join(',');
      const params = [groupId, ...athleteIds];
      await db().query(
        `insert into athlete_group_members (group_id, athlete_id) values ${values}
         on conflict do nothing`,
        params,
      );
    }
  }

  const result = await getGroup(coachId, groupId);
  if (!result) throw new Error('Group not found after update');
  return result;
}

/** Supprime un groupe et ses adhésions. */
export async function deleteGroup(coachId: string, groupId: string): Promise<void> {
  const rows = await affected(await db().query(`delete from athlete_groups where id = $1 and coach_user_id = $2`, [groupId, coachId]));
  if (rows === 0) throw new Error('Group not found or not owned by this coach');
}

/** Nombre total de groupes d'un coach. */
export async function countGroupsOf(coachId: string): Promise<number> {
  const { rows } = await db().query<{ count: number }>(`select count(*)::int as count from athlete_groups where coach_user_id = $1`, [coachId]);
  return rows[0]?.count ?? 0;
}

/** IDs des groupes de ce coach contenant cet athlète. */
export async function getGroupIds(coachId: string, athleteId: string): Promise<string[]> {
  const { rows } = await db().query<{ id: string }>(
    `select distinct g.id from athlete_groups g join athlete_group_members m on m.group_id = g.id
     where g.coach_user_id = $1 and m.athlete_id = $2`,
    [coachId, athleteId],
  );
  return rows.map((r) => r.id);
}
