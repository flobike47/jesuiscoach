-- ============================================================================
-- Séances enregistrées par le coach (écran « Séances » → « Mes séances »)
-- ============================================================================
-- Une séance au format texte Intervals.icu, gardée dans l'app sans être
-- envoyée : le coach la retrouve, la modifie et l'envoie quand il veut.
-- Toujours lue et écrite filtrée par coach (src/db/repo.ts).
-- ============================================================================

create table saved_workouts (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references users(id) on delete cascade,
  name         text not null check (length(name) between 1 and 120),
  sport        text not null default 'Ride' check (sport in ('Ride', 'Run', 'Swim')),
  description  text not null check (length(description) between 1 and 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index saved_workouts_coach_idx on saved_workouts (coach_id, updated_at desc);
