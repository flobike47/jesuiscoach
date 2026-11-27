-- ============================================================================
-- Jour de repos prescrit par le coach
-- ============================================================================
-- Un jour vide n'est pas un repos : le coach peut maintenant programmer un
-- repos (kind = 'rest'), distinct du « repos habituel » que l'athlète déclare
-- dans ses disponibilités. Recopié vers Intervals.icu comme une NOTE (pas de
-- catégorie « repos » là-bas) ; l'app le reconnaît par sa ligne (intervals_id).
-- La contrainte inline de 008 porte le nom par défaut de Postgres : pas de
-- « if exists », pour qu'un nom inattendu fasse échouer la migration.
-- ============================================================================

alter table calendar_events drop constraint calendar_events_kind_check;
alter table calendar_events add constraint calendar_events_kind_check check (kind in ('workout', 'race', 'note', 'rest'));
