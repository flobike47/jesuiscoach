-- ============================================================================
-- jesuiscoach — schéma initial (Postgres 16, hébergé sur le Raspberry Pi)
-- ============================================================================
-- Appliqué automatiquement au démarrage du BFF (src/db/migrate.ts), dans une
-- transaction. Une migration appliquée n'est JAMAIS modifiée : on en ajoute
-- une nouvelle (002_…).
--
-- Seul le BFF accède à la base (Postgres n'est pas exposé hors du réseau
-- interne de la stack) : l'isolation entre utilisateurs est assurée par les
-- requêtes du BFF (src/db/repo.ts), testées sur un vrai Postgres (PGlite).
-- ============================================================================

-- Un utilisateur = un athlète Intervals.icu (créé à sa première connexion OAuth).
create table users (
  id                    uuid primary key default gen_random_uuid(),
  intervals_athlete_id  text not null unique check (intervals_athlete_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  name                  text not null check (length(name) between 1 and 120),
  role                  text not null default 'athlete' check (role in ('coach', 'athlete')),
  created_at            timestamptz not null default now()
);

-- Jeton OAuth Intervals.icu, chiffré AES-256-GCM par le BFF (TOKEN_ENCRYPTION_KEY).
create table intervals_tokens (
  user_id           uuid primary key references users(id) on delete cascade,
  access_token_enc  text not null,
  scope             text not null default '',
  updated_at        timestamptz not null default now()
);

-- Sessions de l'app : seul le hash SHA-256 du jeton est stocké.
create table sessions (
  token_hash    text primary key check (length(token_hash) = 64),
  user_id       uuid not null references users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  user_agent    text check (length(user_agent) <= 512)
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

-- Qui coache qui.
create table coach_athletes (
  coach_id    uuid not null references users(id) on delete cascade,
  athlete_id  uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);
create index coach_athletes_athlete_idx on coach_athletes (athlete_id);

-- Lien d'inscription à usage unique (7 jours).
create table invitations (
  code        text primary key check (code ~ '^[A-Za-z0-9_-]{8,64}$'),
  coach_id    uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_by     uuid references users(id) on delete set null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index invitations_coach_idx on invitations (coach_id);

-- Un abonnement Web Push par appareil (repris d'investhelper).
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique check (length(endpoint) between 10 and 2048),
  p256dh      text not null check (length(p256dh) between 1 and 256),
  auth        text not null check (length(auth) between 1 and 64),
  user_agent  text check (length(user_agent) <= 512),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);
