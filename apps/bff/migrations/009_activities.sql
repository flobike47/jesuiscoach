-- ============================================================================
-- Copie des sorties dans l'app (résumé, courbes seconde par seconde) et calculs
-- faits par l'app. Intervals.icu apporte les sorties ; les valeurs qu'il calcule
-- sont gardées à côté (icu_*) pour comparer et servir de repli.
-- Toujours lues et écrites filtrées par utilisateur (src/db/activityRepo.ts).
-- ============================================================================

create table activities (
  user_id            uuid not null references users(id) on delete cascade,
  id                 text not null check (length(id) between 1 and 64),    -- id Intervals.icu (ou autre source)
  source             text not null default 'intervals' check (source in ('intervals', 'wahoo', 'garmin', 'coros')),
  start_utc          timestamptz,
  start_local        text not null check (length(start_local) between 10 and 25), -- AAAA-MM-JJTHH:MM:SS
  sport              text,                                                  -- Ride / Run / Swim / autre type brut
  type_raw           text,
  name               text check (length(name) <= 200),
  moving_secs        integer, elapsed_secs integer, distance_m numeric(10,1), elevation_m numeric(7,1),
  avg_hr             smallint, max_hr smallint, avg_watts smallint, avg_cadence smallint,
  -- Calculs de l'app (null tant que les courbes ne sont pas là)
  weighted_watts     smallint,            -- Puissance pondérée
  intensity          numeric(4,3),        -- fraction (0,853)
  load               numeric(6,1),        -- Charge
  load_method        text check (load_method in ('power', 'hr', 'pace', 'none')),
  ftp_used           smallint, lthr_used smallint,
  power_zone_secs    integer[],           -- Z1…Z7
  hr_zone_secs       integer[],           -- Z1…Z5 (Friel)
  -- Valeurs d'Intervals.icu (comparaison et repli)
  icu_load           numeric(6,1), icu_weighted_watts smallint, icu_intensity numeric(4,3),
  icu_raw            jsonb,               -- résumé Intervals tel que reçu
  streams_status     text not null default 'missing' check (streams_status in ('missing', 'stored', 'none', 'error')),
  computed_at        timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, id)
);
create index activities_user_start_idx on activities (user_id, start_local desc);

create table activity_streams (
  user_id      uuid not null,
  activity_id  text not null,
  data         bytea not null,              -- JSON { time, watts, heartrate, cadence, velocity, distance, altitude } compressé gzip
  points       integer not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, activity_id),
  foreign key (user_id, activity_id) references activities(user_id, id) on delete cascade
);

create table activity_bests (           -- meilleure puissance moyenne par durée, par sortie
  user_id      uuid not null,
  activity_id  text not null,
  secs         integer not null,
  watts        smallint not null,
  primary key (user_id, activity_id, secs),
  foreign key (user_id, activity_id) references activities(user_id, id) on delete cascade
);
create index activity_bests_user_secs_idx on activity_bests (user_id, secs, watts desc);
