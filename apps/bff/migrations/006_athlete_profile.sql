-- ============================================================================
-- Fiche profil de l'athlète : identité, physiologie, VMA et tests physiques
-- ============================================================================
-- L'app est la source de vérité : les valeurs saisies ici sont poussées vers
-- Intervals.icu (puis la montre). Les données sans équivalent chez Intervals
-- (VMA, tests) restent dans l'app. Toujours lues et écrites filtrées par
-- utilisateur (src/db/profileRepo.ts).
-- ============================================================================

-- Identité et valeurs communes (une ligne par utilisateur)
create table athlete_profile (
  user_id        uuid primary key references users(id) on delete cascade,
  birth_date     date,
  sex            text check (sex in ('M', 'F')),
  height_cm      smallint check (height_cm between 120 and 230),
  weight_kg      numeric(4,1) check (weight_kg between 30 and 200),
  resting_hr     smallint check (resting_hr between 25 and 110),
  vma_kmh        numeric(3,1) check (vma_kmh between 8 and 25),
  updated_at     timestamptz not null default now(),
  updated_by     text not null default 'athlete' check (updated_by in ('athlete', 'coach', 'intervals')),
  synced_at      timestamptz,
  sync_error     text check (length(sync_error) <= 300)
);

-- Valeurs par sport
create table athlete_physiology (
  user_id          uuid not null references users(id) on delete cascade,
  sport            text not null check (sport in ('Ride', 'Run', 'Swim')),
  ftp              smallint check (ftp between 50 and 600),
  lthr             smallint check (lthr between 80 and 220),
  max_hr           smallint check (max_hr between 100 and 230),
  threshold_secs   smallint check (threshold_secs between 60 and 600), -- course : s/km ; natation : s/100 m
  updated_at       timestamptz not null default now(),
  updated_by       text not null default 'athlete' check (updated_by in ('athlete', 'coach', 'intervals')),
  primary key (user_id, sport)
);

-- Tests physiques
create table physio_tests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  day         date not null,
  kind        text not null check (kind in ('ftp', 'lthr', 'vma', 'run_threshold', 'swim_threshold', 'other')),
  value       numeric(6,1) not null,
  note        text check (length(note) <= 300),
  created_at  timestamptz not null default now()
);
create index physio_tests_user_idx on physio_tests (user_id, day desc);
