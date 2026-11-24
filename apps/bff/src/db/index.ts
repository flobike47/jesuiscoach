import pg from 'pg';
import { config } from '../config.js';

/**
 * Accès Postgres. Interface minimale `query(sql, params)` : la même que
 * PGlite, ce qui permet aux tests de tourner sur un vrai Postgres en mémoire
 * (test/helpers.ts → setDb).
 *
 * Toujours des requêtes paramétrées ($1, $2…) : jamais de concaténation.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; affectedRows?: number; rowCount?: number | null }>;
  /** Script SQL à plusieurs instructions, sans paramètres (migrations). */
  exec(sql: string): Promise<unknown>;
  /** Exécute `fn` dans une transaction (BEGIN / COMMIT, ROLLBACK sur erreur). */
  transaction<T>(fn: (tx: Pick<Db, 'query' | 'exec'>) => Promise<T>): Promise<T>;
}

let current: Db | null = null;
let pool: pg.Pool | null = null;

function poolDb(): Db {
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    // Pi + 10 utilisateurs : peu de connexions suffisent.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Une requête qui pend ne doit pas bloquer une route indéfiniment.
    statement_timeout: 10_000,
  });
  pool.on('error', (err) => console.error('[postgres]', err.message));
  const p = pool;
  return {
    query: (sql, params) => p.query(sql, params) as never,
    // Sans paramètres, pg passe par le protocole simple : plusieurs instructions OK.
    exec: (sql) => p.query(sql),
    transaction: async (fn) => {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: (sql, params) => client.query(sql, params) as never,
          exec: (sql) => client.query(sql),
        });
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

export function db(): Db {
  current ??= poolDb();
  return current;
}

/** Tests : remplace la base (PGlite en mémoire). */
export function setDb(next: Db): void {
  current = next;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

/** Nombre de lignes touchées, que le pilote soit pg (rowCount) ou PGlite (affectedRows). */
export function affected(r: { affectedRows?: number; rowCount?: number | null }): number {
  return r.rowCount ?? r.affectedRows ?? 0;
}
