-- ============================================================================
-- Plans d'entraînement du coach (écran « Séances »)
-- ============================================================================
-- Un plan = une suite de séances au format texte Intervals.icu, chacune
-- placée par un décalage en jours depuis la date de départ. Appliquer un plan
-- crée les séances dans le calendrier des athlètes ; le plan lui-même reste
-- dans l'app (la bibliothèque Intervals.icu est en lecture seule).
-- Séances en JSONB : [{ "day": 0, "name": "…", "description": "…" }],
-- validées par le BFF (src/lib/plans.ts), bornées ici en défense.
-- ============================================================================

create table training_plans (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references users(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  workouts    jsonb not null check (jsonb_typeof(workouts) = 'array' and jsonb_array_length(workouts) between 1 and 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index training_plans_coach_idx on training_plans (coach_id, updated_at desc);
