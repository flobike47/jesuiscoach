-- ============================================================================
-- Synchro des sorties et notifications au coach
-- ============================================================================
-- Le job de synchro (src/jobs/sync.ts) lit les sorties récentes de chaque
-- athlète connecté. Une sortie jamais vue = une notification aux coachs.
-- L'insertion « on conflict do nothing returning » garantit qu'une sortie
-- n'est notifiée qu'une fois, même si deux synchros se chevauchent.
-- ============================================================================

create table seen_activities (
  user_id      uuid not null references users(id) on delete cascade,
  activity_id  text not null check (length(activity_id) between 1 and 64),
  seen_at      timestamptz not null default now(),
  primary key (user_id, activity_id)
);
create index seen_activities_seen_idx on seen_activities (seen_at);

-- Première synchro d'un athlète : on mémorise l'existant sans notifier
-- (sinon un nouvel inscrit déclencherait une rafale de notifications).
create table sync_state (
  user_id         uuid primary key references users(id) on delete cascade,
  initialized_at  timestamptz not null default now(),
  last_sync_at    timestamptz,
  last_error      text check (length(last_error) <= 500)
);

-- Alertes actuellement actives par athlète : seule une alerte qui apparaît
-- est notifiée ; elle peut l'être à nouveau après avoir disparu.
create table active_alerts (
  user_id       uuid not null references users(id) on delete cascade,
  code          text not null check (code in ('fatigue', 'ramp', 'inactive', 'missed')),
  active_since  timestamptz not null default now(),
  primary key (user_id, code)
);
