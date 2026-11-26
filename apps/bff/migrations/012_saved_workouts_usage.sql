-- ============================================================================
-- Favoris et usage des séances enregistrées (phase F2)
-- ============================================================================
-- Ajoute le support pour marquer une séance comme favorite et tracker
-- le nombre d'envois (sent_count) et la date du dernier envoi (last_sent_at).
-- ============================================================================

alter table saved_workouts add column favorite boolean not null default false;
alter table saved_workouts add column sent_count integer not null default 0 check (sent_count >= 0);
alter table saved_workouts add column last_sent_at timestamptz;

-- Mettre à jour l'index pour supporter le tri par favoris et last_sent_at
drop index saved_workouts_coach_idx;
create index saved_workouts_coach_idx on saved_workouts (coach_id, favorite desc, last_sent_at desc nulls last, updated_at desc);
