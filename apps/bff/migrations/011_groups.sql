-- ============================================================================
-- Groupes d'athlètes (phase E) : organisation de l'équipe, attribution groupée.
-- Tables : athlete_groups (id, coach_user_id, name, created_at) et
-- athlete_group_members (group_id, athlete_id, primary key).
-- Pas de RLS : isolation dans src/db/groupRepo.ts (toujours filtrées par coach_user_id).
-- ============================================================================

create table athlete_groups (
  id               uuid primary key default gen_random_uuid(),
  coach_user_id    uuid not null references users(id) on delete cascade,
  name             text not null check (length(name) >= 1 and length(name) <= 40),
  created_at       timestamptz not null default now()
);
create index athlete_groups_coach_idx on athlete_groups (coach_user_id);

create table athlete_group_members (
  group_id         uuid not null references athlete_groups(id) on delete cascade,
  -- Identifiant Intervals.icu, comme partout dans l'API (teamOf, routes /athletes/:id).
  athlete_id       text not null references users(intervals_athlete_id) on delete cascade,
  primary key (group_id, athlete_id)
);
create index athlete_group_members_athlete_idx on athlete_group_members (athlete_id);
