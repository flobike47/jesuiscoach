/**
 * Base de test : un vrai Postgres en mémoire (PGlite, Postgres 16 en WASM)
 * sur lequel on joue les vraies migrations. Contraintes, cascades et filtres
 * d'isolation sont donc testés pour de bon — un oubli de `where user_id = $1`
 * fait échouer les tests d'isolation.
 */
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { setDb, type Db } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
/** Jetons de session de test → utilisateur. */
export const TOKENS = { 'token-a': USER_A, 'token-b': USER_B } as const;

let pg: PGlite | null = null;

/** Crée la base PGlite, joue les migrations et la branche sur le BFF (setDb). */
export async function setupTestDb(): Promise<Db> {
  pg = new PGlite();
  const p = pg;
  const db: Db = {
    query: (sql, params) => p.query(sql, params) as never,
    exec: (sql) => p.exec(sql),
    transaction: (fn) => p.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) as never, exec: (sql) => tx.exec(sql) })),
  };
  await migrate(db);
  setDb(db);
  return db;
}

/**
 * Vide les tables puis recrée les deux utilisateurs de test (A coach, B
 * athlète) et leurs sessions `token-a` / `token-b`.
 */
export async function resetDb(): Promise<void> {
  if (!pg) throw new Error('setupTestDb() d’abord');
  await pg.exec(`truncate users, intervals_tokens, sessions, coach_athletes, invitations, push_subscriptions cascade`);
  await pg.query(
    `insert into users (id, intervals_athlete_id, name, role) values ($1, 'iA', 'Coach A', 'coach'), ($2, 'iB', 'Athlète B', 'athlete')`,
    [USER_A, USER_B],
  );
  for (const [token, userId] of Object.entries(TOKENS)) {
    await pg.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 day')`, [
      createHash('sha256').update(token).digest('hex'),
      userId,
    ]);
  }
}

/** Lignes d'une table (vérifications des tests). */
export async function rows<T = Record<string, unknown>>(table: string): Promise<T[]> {
  if (!/^[a-z_]+$/.test(table)) throw new Error('table invalide');
  return (await pg!.query<T>(`select * from ${table}`)).rows;
}

export const auth = (token: keyof typeof TOKENS) => ({ authorization: `Bearer ${token}` });
