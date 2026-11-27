import { db } from './index.js';

/**
 * Partages de données de santé décidés par l'athlète (migration 015).
 * Toujours filtrés par `user_id` de l'athlète : c'est la seule barrière
 * d'isolation (pas de RLS).
 */

const toIso = (v: unknown): string | null => (v == null ? null : new Date(v as string | Date).toISOString());

/** Date depuis laquelle l'athlète partage la courbe de son poids avec son coach ; null = non partagé. */
export async function weightSharedSince(userId: string): Promise<string | null> {
  const { rows } = await db().query<{ weight_shared_at: unknown }>('select weight_shared_at from data_sharing where user_id = $1', [userId]);
  return toIso(rows[0]?.weight_shared_at);
}

/**
 * Accorde ou retire le partage, en une seule instruction. Un accord déjà
 * donné garde sa date d'origine ; un retrait remet la colonne à null.
 */
export async function setWeightShared(userId: string, shared: boolean): Promise<string | null> {
  const { rows } = await db().query<{ weight_shared_at: unknown }>(
    `insert into data_sharing (user_id, weight_shared_at, updated_at)
     values ($1, case when $2::boolean then now() else null end, now())
     on conflict (user_id) do update
       set weight_shared_at = case when $2::boolean then coalesce(data_sharing.weight_shared_at, now()) else null end,
           updated_at = now()
     returning weight_shared_at`,
    [userId, shared],
  );
  return toIso(rows[0]?.weight_shared_at);
}
