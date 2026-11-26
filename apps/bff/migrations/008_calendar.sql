-- ============================================================================
-- Calendrier dans l'app : séances, compétitions, notes et objectifs
-- ============================================================================
-- Source de vérité du calendrier de l'athlète. Chaque ligne créée ou modifiée
-- dans l'app est recopiée vers Intervals.icu (intervals_id) ; les événements
-- créés directement dans Intervals.icu sont importés (origin = 'intervals').
-- Pas de RLS : l'isolation est dans src/db/calendarRepo.ts (user_id).
-- ============================================================================

create table calendar_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,   -- l'athlète
  kind               text not null check (kind in ('workout', 'race', 'note')),
  sport              text check (sport in ('Ride', 'Run', 'Swim')),
  day                date not null,
  name               text not null check (length(name) between 1 and 120),
  description        text check (length(description) <= 4000),
  race_priority      text check (race_priority in ('A', 'B', 'C')),         -- kind = race
  race_distance_m    integer check (race_distance_m between 100 and 1000000),
  race_goal          text check (length(race_goal) <= 200),                 -- ex. « finir en 4 h 30 »
  origin             text not null default 'app' check (origin in ('app', 'intervals')),
  intervals_id       text check (length(intervals_id) <= 40),               -- id de l'événement chez Intervals.icu
  sync_status        text not null default 'pending' check (sync_status in ('pending', 'synced', 'error')),
  sync_error         text check (length(sync_error) <= 300),
  created_by         text not null default 'coach' check (created_by in ('athlete', 'coach', 'intervals')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (kind <> 'race' or race_priority is not null)
);
create unique index calendar_events_intervals_idx on calendar_events (user_id, intervals_id) where intervals_id is not null;
create index calendar_events_day_idx on calendar_events (user_id, day);

create table goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  title         text not null check (length(title) between 1 and 120),
  metric        text check (metric in ('ftp', 'weight', 'run_threshold', 'swim_threshold', 'vma', 'weekly_hours', 'other')),
  target_value  numeric(7,1),
  due_day       date,
  race_id       uuid references calendar_events(id) on delete set null,
  achieved_on   date,
  note          text check (length(note) <= 500),
  created_by    text not null default 'coach' check (created_by in ('athlete', 'coach')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index goals_user_idx on goals (user_id, due_day);
