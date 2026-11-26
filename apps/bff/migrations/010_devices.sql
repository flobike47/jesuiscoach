-- ============================================================================
-- Appareils reliés directement à l'app (phase E) : connexion Wahoo, séances
-- poussées vers le compteur. Jetons chiffrés (src/lib/crypto.ts), jamais
-- renvoyés au web. Pas de RLS : isolation dans src/db/deviceRepo.ts.
-- ============================================================================

create table device_connections (
  user_id            uuid not null references users(id) on delete cascade,
  provider           text not null check (provider in ('wahoo', 'garmin', 'coros')),
  external_user_id   text not null check (length(external_user_id) <= 64),
  access_token_enc   text not null,
  refresh_token_enc  text not null,
  expires_at         timestamptz not null,
  scope              text not null default '',
  connected_at       timestamptz not null default now(),
  last_error         text check (length(last_error) <= 300),
  primary key (user_id, provider)
);
create unique index device_connections_external_idx on device_connections (provider, external_user_id);

create table device_pushes (            -- séances poussées vers un appareil
  user_id       uuid not null references users(id) on delete cascade,
  provider      text not null,
  event_id      uuid not null references calendar_events(id) on delete cascade,
  plan_id       text, workout_id text,
  pushed_at     timestamptz not null default now(),
  content_hash  text not null,            -- pour ne repousser que si la séance a changé
  status        text not null check (status in ('pushed', 'error', 'skipped')),
  error         text check (length(error) <= 300),
  primary key (user_id, provider, event_id)
);
