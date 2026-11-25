-- ============================================================================
-- Fiche profil : disponibilités, matériel, exceptions et blessures
-- ============================================================================
-- Données saisies dans l'app (jamais envoyées à Intervals.icu). Le coach peut
-- les modifier ; `updated_by` garde qui a fait la dernière modification.
-- Les données de santé (injuries) ne sont visibles que de l'athlète et de son
-- coach (src/db/careRepo.ts, filtré par user_id).
-- ============================================================================

-- Semaine type : une ligne par jour (0 = lundi … 6 = dimanche)
create table athlete_availability (
  user_id      uuid not null references users(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  available    boolean not null default true,
  max_minutes  smallint check (max_minutes between 10 and 720),
  slot         text not null default 'any' check (slot in ('any', 'morning', 'noon', 'evening')),
  place        text not null default 'any' check (place in ('any', 'outdoor', 'indoor')),
  primary key (user_id, weekday)
);

-- Réglages généraux de la fiche (volume visé, matériel, qui a modifié)
create table athlete_care (
  user_id          uuid primary key references users(id) on delete cascade,
  weekly_minutes   smallint check (weekly_minutes between 0 and 3000),
  power_meter      boolean not null default false,
  hr_strap         boolean not null default false,
  smart_trainer    boolean not null default false,
  pool_access      boolean not null default false,
  updated_at       timestamptz not null default now(),
  updated_by       text not null default 'athlete' check (updated_by in ('athlete', 'coach'))
);

-- Exceptions (vacances, déplacement) : indisponible du … au …
create table availability_exceptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  from_day    date not null,
  to_day      date not null check (to_day >= from_day),
  note        text check (length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index availability_exceptions_user_idx on availability_exceptions (user_id, from_day);

-- Blessures et limitations (données de santé : athlète et son coach seulement)
create table injuries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  title            text not null check (length(title) between 1 and 120),
  started_on       date not null,
  expected_end     date,
  ended_on         date,
  avoid_sports     text[] not null default '{}' check (avoid_sports <@ array['Ride','Run','Swim']::text[]),
  avoid_intensity  boolean not null default false,
  note             text check (length(note) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index injuries_user_idx on injuries (user_id, started_on desc);
