-- ============================================================================
-- Partage de l'évolution du poids avec le coach (donnée de santé, RGPD).
-- Une ligne par athlète ; `weight_shared_at` non nul = l'athlète autorise son
-- coach à voir la courbe de son poids, depuis cette date (trace du
-- consentement). Ligne absente ou colonne nulle = non partagé (par défaut).
-- Révocable à tout moment : la colonne repasse à null. Vérifié par le BFF à
-- chaque requête (routes/trends.ts), jamais mis en cache.
-- Pas de RLS : isolation dans src/db/sharingRepo.ts (toujours filtrée par user_id).
-- ============================================================================

create table data_sharing (
  user_id            uuid primary key references users(id) on delete cascade,
  weight_shared_at   timestamptz,
  updated_at         timestamptz not null default now()
);
