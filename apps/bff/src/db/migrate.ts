import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from './index.js';

/**
 * Applique les migrations `migrations/NNN_*.sql` pas encore jouées, dans
 * l'ordre, chacune dans sa transaction. Appelé au démarrage du BFF : une
 * nouvelle version déployée sur le Pi met la base à jour toute seule.
 *
 * Le dossier est résolu depuis ce fichier : src/db → ../../migrations en dev,
 * dist/db → ../../migrations dans l'image (copié par le Dockerfile).
 */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const FILE_RE = /^(\d{3})_[a-z0-9_]+\.sql$/;

export async function migrate(database: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await database.query(`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`);
  const files = (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort();
  const { rows } = await database.query<{ version: string }>('select version from schema_migrations');
  const done = new Set(rows.map((r) => r.version));
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(`${dir}${file}`, 'utf8');
    await database.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into schema_migrations (version) values ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
