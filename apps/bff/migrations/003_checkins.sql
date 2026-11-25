-- ============================================================================
-- Ressenti quotidien de l'athlète (écran « Aujourd'hui »)
-- ============================================================================
-- Un ressenti par athlète et par jour (le dernier saisi remplace le
-- précédent). Visible par l'athlète et par ses coachs.
-- ============================================================================

create table checkins (
  user_id     uuid not null references users(id) on delete cascade,
  day         date not null,
  -- 1 = très mal … 5 = en pleine forme
  feeling     smallint not null check (feeling between 1 and 5),
  -- Effort perçu de la sortie du jour (1 → 10), facultatif
  rpe         smallint check (rpe between 1 and 10),
  note        text check (length(note) <= 500),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);
