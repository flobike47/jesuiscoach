import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Bed, ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet, SkeletonList, Placeholder } from '@/components/ios';
import { useTeamCalendar, useGroups, useGroupMutations } from '@/hooks/useTeamPlanning';
import { useTeam } from '@/hooks/useCoach';
import { useEventMutations } from '@/hooks/useCalendarData';
import { useSavedWorkouts } from '@/hooks/useCoach';
import { formatLoad, dayShort } from '@/lib/format';
import { formZone } from '@/lib/form';
import { TEMPLATES, SPORT_LABELS } from '@/lib/workout';
import { EditEventSheet } from '@/components/calendar/EventSheets';
import { TeamLoadChart } from '@/components/calendar/TeamLoadChart';
import { teamWorkoutAsEvent } from '@/lib/teamEvent';
import { RestSheet } from '@/components/calendar/RestDay';
import { isPrescribedRest, teamRestAsEvent } from '@/lib/restDay';
import type { AppEvent } from '@/services/calendarApi';
import {
  cellKind,
  shortDuration,
  textOn,
  dominantColor,
  filterByGroup,
  selectionSummary,
  isOverload,
  weekCounts
} from '@/lib/teamPlanning';
import type { Group } from '@/types';
import type { Sport } from '@/lib/workout';

function startOfWeek(d: dayjs.Dayjs): dayjs.Dayjs {
  const offset = (d.day() + 6) % 7;
  return d.subtract(offset, 'day').startOf('day');
}

/**
 * Affichage du planning d'équipe : grille des athlètes et leurs séances par jour,
 * filtrage par groupe, sélection multiple pour attribution groupée.
 */
export function TeamPlanning() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(dayjs()));
  const from = weekStart.format('YYYY-MM-DD');
  const to = weekStart.add(6, 'day').format('YYYY-MM-DD');

  const cal = useTeamCalendar(from, to);
  const groups = useGroups();
  const team = useTeam(true);
  const { create } = useEventMutations();
  const saved = useSavedWorkouts();

  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedCells, setSelectedCells] = useState<Array<{ athleteId: string; date: string }>>([]);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [pickerProgress, setPickerProgress] = useState({ current: 0, total: 0 });
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<{ event: AppEvent; athleteId: string } | null>(null);
  const [showGroupSheet, setShowGroupSheet] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const groupMutations = useGroupMutations();
  const [restBusy, setRestBusy] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);

  // Filtrer les athlètes et préparer les données
  const athletes = useMemo(() => {
    const all = cal.data?.athletes ?? [];
    const filtered = filterByGroup(all, selectedGroup);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [cal.data?.athletes, selectedGroup]);

  // Compter les séances et cases libres
  const { planned, free } = useMemo(() => weekCounts(athletes), [athletes]);

  // Groupes avec comptage
  const isActive = (g: { id: string | null }) => (g.id == null ? selectedGroup == null : selectedGroup?.id === g.id);
  const groupsWithCounts = useMemo(() => {
    const allAthletes = cal.data?.athletes ?? [];
    const all = { id: null, name: 'Tous', athleteIds: allAthletes.map((a) => a.id) };
    const list = groups.data?.groups ?? [];

    return [all, ...list].map((g) => {
      const count = allAthletes.filter((a) => g.athleteIds.includes(a.id)).length;
      return { group: g, count };
    });
  }, [cal.data?.athletes, groups.data?.groups]);

  // Marquer une cellule comme sélectionnée
  const toggleCellSelection = (athleteId: string, date: string, dayKind: string) => {
    if (dayKind === 'workout' || dayKind === 'extra' || dayKind === 'off' || dayKind === 'rest') return;

    const isSelected = selectedCells.some((c) => c.athleteId === athleteId && c.date === date);

    if (isSelected) {
      setSelectedCells(selectedCells.filter((c) => c.athleteId !== athleteId || c.date !== date));
    } else {
      setSelectedCells([...selectedCells, { athleteId, date }]);
    }
  };

  // Choisir et planifier une séance
  const planWorkout = async (workoutName: string, description: string, sport: string) => {
    if (selectedCells.length === 0) return;

    setPickerProgress({ current: 0, total: selectedCells.length });
    let successCount = 0;

    for (const cell of selectedCells) {
      try {
        await create.mutateAsync({
          athleteId: cell.athleteId,
          body: {
            kind: 'workout',
            date: cell.date,
            name: workoutName,
            sport: sport as Sport,
            description,
          },
        });
        successCount += 1;
        setPickerProgress({ current: successCount, total: selectedCells.length });
      } catch (err) {
        setPickerError(`${workoutName} pour ${cell.athleteId}: ${(err as Error).message}`);
      }
    }

    if (successCount === selectedCells.length) {
      setSelectedCells([]);
      setShowWorkoutPicker(false);
      setPickerProgress({ current: 0, total: 0 });
    }
  };

  // Prescrire un repos sur les cases choisies (une écriture par case, recopiée vers Intervals.icu).
  const prescribeRest = async () => {
    if (selectedCells.length === 0) return;
    setRestBusy(true);
    setRestError(null);
    const failed: Array<{ athleteId: string; date: string }> = [];
    for (const cell of selectedCells) {
      try {
        await create.mutateAsync({ athleteId: cell.athleteId, body: { kind: 'rest', date: cell.date, name: 'Repos' } });
      } catch (err) {
        failed.push(cell);
        setRestError((err as Error).message);
      }
    }
    // Les cases en échec restent sélectionnées pour réessayer.
    setSelectedCells(failed);
    setRestBusy(false);
  };

  if (cal.isLoading) return <SkeletonList rows={4} avatar={false} />;
  if (cal.error) return <Placeholder title="Planning indisponible">{cal.error.message}</Placeholder>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 8px' }}>
        <button
          type="button"
          aria-label="Semaine précédente"
          onClick={() => setWeekStart((w) => w.subtract(7, 'day'))}
          style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}
        >
          <ChevronLeft size={24} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="headline">
            {weekStart.format('D MMM')} – {weekStart.add(6, 'day').format('D MMM')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--label-2)' }}>
            {planned} séances prévues · {free} cases libres
          </div>
        </div>
        <button
          type="button"
          aria-label="Semaine suivante"
          onClick={() => setWeekStart((w) => w.add(7, 'day'))}
          style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Puces de filtrage par groupe */}
      <div style={{ display: 'flex', gap: 6, margin: '12px 0 12px', overflow: 'auto', paddingRight: 12, alignItems: 'center' }}>
        {groupsWithCounts.map(({ group, count }) => (
          <div key={group.id ?? 'tous'} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setSelectedGroup(group.id != null && selectedGroup?.id !== group.id ? (group as Group) : null);
              }}
              style={{
                minHeight: 32,
                padding: '0 12px',
                borderRadius: 16,
                background: isActive(group) ? 'var(--tint)' : 'var(--cell)',
                color: isActive(group) ? '#fff' : 'var(--label)',
                fontSize: 14,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {group.name} · {count}
            </button>
            {group.id != null && selectedGroup?.id === group.id && (
              <button
                type="button"
                onClick={() => {
                  setEditingGroup(selectedGroup);
                  setShowGroupSheet(true);
                }}
                style={{
                  minHeight: 32,
                  padding: '0 8px',
                  borderRadius: 16,
                  background: 'transparent',
                  color: 'var(--tint)',
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid var(--tint)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Modifier
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setEditingGroup(null);
            setShowGroupSheet(true);
          }}
          style={{
            minHeight: 32,
            padding: '0 12px',
            borderRadius: 16,
            background: 'var(--cell)',
            color: 'var(--label)',
            fontSize: 14,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          + Groupe
        </button>
      </div>

      {/* Grille du planning */}
      <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(7, minmax(0, 1fr)) 34px', gap: 3, alignItems: 'stretch', margin: '12px 0' }}>
        {/* En-tête */}
        <span style={{ fontSize: 11, color: 'var(--label-2)', textAlign: 'center', fontWeight: 500 }}></span>
        {Array.from({ length: 7 }, (_, i) => {
          const d = weekStart.add(i, 'day');
          return (
            <span key={d.format('YYYY-MM-DD')} style={{ fontSize: 11, color: 'var(--label-2)', textAlign: 'center' }}>
              {dayShort(d.format('YYYY-MM-DD'))} {d.date()}
            </span>
          );
        })}
        <span style={{ fontSize: 11, color: 'var(--label-2)', textAlign: 'center' }}>Σ</span>

        {/* Lignes d'athlètes */}
        {athletes.map((athlete) => (
          <div key={athlete.id} style={{ display: 'contents' }}>
            {/* Pastille de couleur + nom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 13 }}>
              {(() => {
                const teamAthlete = team.data?.athletes.find((a) => a.id === athlete.id);
                const form = teamAthlete?.form ?? 0;
                const zone = formZone(form);
                return (
                  <span
                    style={{
                      flex: 'none',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: zone.color,
                    }}
                  />
                );
              })()}
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {athlete.name}
              </span>
            </div>

            {/* Cellules par jour */}
            {athlete.days.map((day) => {
              const kind = cellKind(day);
              const isSelected = selectedCells.some((c) => c.athleteId === athlete.id && c.date === day.date);
              const isWorkout = kind === 'workout' && day.workouts[0];
              const bgColor = isSelected
                ? 'color-mix(in srgb, var(--blue) 16%, transparent)'
                : kind === 'free'
                ? 'var(--cell)'
                : kind === 'off'
                ? 'repeating-linear-gradient(135deg, var(--fill-2) 0 2px, transparent 2px 6px)'
                : kind === 'rest'
                ? 'color-mix(in srgb, var(--indigo) 22%, var(--cell))'
                : kind === 'extra'
                ? 'var(--fill-2)'
                : dominantColor(day.workouts[0]?.description);

              const textColor = isSelected ? 'var(--blue)' : isWorkout ? textOn(bgColor) : 'var(--label)';

              return (
                <button
                  key={`${athlete.id}-${day.date}`}
                  type="button"
                  aria-label={`${athlete.name}, ${dayjs(day.date).format('dddd D MMMM')} : ${
                    isWorkout ? day.workouts[0].name : kind === 'rest' ? 'repos prescrit' : kind === 'off' ? 'indisponible' : kind === 'extra' ? 'sortie hors plan' : 'libre'
                  }`}
                  aria-pressed={kind === 'free' ? isSelected : undefined}
                  onClick={() => {
                    if (isWorkout) {
                      setEditingEvent({ event: teamWorkoutAsEvent(day.workouts[0], day.date), athleteId: athlete.id });
                    } else if (kind === 'rest' && day.rest) {
                      setEditingEvent({ event: teamRestAsEvent(day.rest, day.date), athleteId: athlete.id });
                    } else {
                      toggleCellSelection(athlete.id, day.date, kind);
                    }
                  }}
                  style={{
                    height: 34,
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    display: 'grid',
                    placeItems: 'center',
                    fontVariantNumeric: 'tabular-nums',
                    border: 'none',
                    cursor: 'pointer',
                    background: bgColor,
                    color: textColor,
                    boxShadow: isSelected ? 'inset 0 0 0 2px var(--blue)' : 'none',
                  }}
                >
                  {isSelected && '+'}
                  {!isSelected && isWorkout && (
                    <span>
                      {day.workouts[0].done ? '✓ ' : ''}{shortDuration(day.workouts[0].seconds)}
                    </span>
                  )}
                  {!isSelected && kind === 'extra' && '✓'}
                  {!isSelected && kind === 'rest' && <Bed size={13} strokeWidth={2.4} color="var(--indigo)" aria-hidden />}
                </button>
              );
            })}

            {/* Charge totale (Σ) */}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                display: 'grid',
                placeItems: 'center',
                color: isOverload(athlete.load) ? 'var(--orange)' : 'var(--label-2)',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {formatLoad(athlete.load.planned)}
            </span>
          </div>
        ))}
      </div>

      <TeamLoadChart athletes={athletes} from={from} to={to} />

      {/* Barre flottante de sélection */}
      {selectedCells.length > 0 && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 'calc(var(--tabbar-h, 83px) + 12px)',
            background: 'var(--fill)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 16,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,.5)',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {selectedCells.length} case{selectedCells.length > 1 ? 's' : ''} sélectionnée{selectedCells.length > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 13, color: 'var(--label-2)' }}>
              {selectionSummary(selectedCells, cal.data?.athletes ?? [])}
            </div>
            {restError && (
              <div role="alert" style={{ fontSize: 13, color: 'var(--red)' }}>
                {restError}
              </div>
            )}
          </div>
          <button
            type="button"
            className="pressable"
            onClick={prescribeRest}
            disabled={restBusy}
            style={{
              minHeight: 40,
              padding: '0 12px',
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--indigo) 18%, transparent)',
              color: 'var(--indigo)',
              fontWeight: 600,
              fontSize: 15,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {restBusy ? 'Envoi…' : 'Repos'}
          </button>
          <button
            type="button"
            onClick={() => setShowWorkoutPicker(true)}
            style={{
              minHeight: 40,
              padding: '0 14px',
              borderRadius: 12,
              background: 'var(--tint)',
              color: 'var(--label)',
              fontWeight: 600,
              fontSize: 15,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Choisir une séance
          </button>
        </div>
      )}

      {/* Sheet de choix de séance */}
      {showWorkoutPicker && (
        <WorkoutPickerSheet
          onClose={() => setShowWorkoutPicker(false)}
          onSelect={planWorkout}
          selectedCount={selectedCells.length}
          progress={pickerProgress}
          error={pickerError}
          savedWorkouts={saved.data?.workouts ?? []}
        />
      )}

      {/* EditEventSheet pour modifier une séance */}
      {editingEvent && isPrescribedRest(editingEvent.event) && (
        <RestSheet athleteId={editingEvent.athleteId} event={editingEvent.event} weekStart={weekStart} onClose={() => setEditingEvent(null)} />
      )}
      {editingEvent && !isPrescribedRest(editingEvent.event) && (
        <EditEventSheet
          athleteId={editingEvent.athleteId}
          event={editingEvent.event}
          weekStart={weekStart}
          onClose={() => setEditingEvent(null)}
        />
      )}

      {/* Feuille de création/modification de groupe */}
      {showGroupSheet && (
        <GroupSheet
          group={editingGroup}
          allAthletes={cal.data?.athletes ?? []}
          onClose={() => {
            setShowGroupSheet(false);
            setEditingGroup(null);
          }}
          onSave={async (name, athleteIds) => {
            if (editingGroup) {
              await groupMutations.update.mutateAsync({ id: editingGroup.id, name, athleteIds });
            } else {
              await groupMutations.create.mutateAsync({ name, athleteIds });
            }
            setShowGroupSheet(false);
            setEditingGroup(null);
          }}
          onDelete={async () => {
            if (editingGroup) {
              await groupMutations.remove.mutateAsync(editingGroup.id);
              setShowGroupSheet(false);
              setEditingGroup(null);
            }
          }}
        />
      )}
    </>
  );
}

function GroupSheet({
  group,
  allAthletes,
  onClose,
  onSave,
  onDelete,
}: {
  group: Group | null;
  allAthletes: { id: string; name: string }[];
  onClose: () => void;
  onSave: (name: string, athleteIds: string[]) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [selected, setSelected] = useState(new Set(group?.athleteIds ?? []));
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      await onSave(name, Array.from(selected));
    } finally {
      setLoading(false);
    }
  };

  const deleteGroup = async () => {
    setLoading(true);
    try {
      await onDelete();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={group ? 'Modifier le groupe' : 'Créer un groupe'}>
      <div className="group" style={{ marginBottom: 16 }}>
        <input
          className="field"
          placeholder="Nom du groupe"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          maxLength={40}
        />
      </div>
      <h3 className="section-header">Athlètes</h3>
      <div className="group">
        {allAthletes.map((a) => (
          <label
            key={a.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--fill-2)',
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(a.id)}
              onChange={(e) => {
                const newSelected = new Set(selected);
                if (e.target.checked) {
                  newSelected.add(a.id);
                } else {
                  newSelected.delete(a.id);
                }
                setSelected(newSelected);
              }}
            />
            {a.name}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={loading || !name.trim()}
        style={{
          width: '100%',
          height: 44,
          borderRadius: 'var(--radius)',
          background: 'var(--tint)',
          color: 'var(--label)',
          fontSize: 16,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          marginTop: 16,
        }}
      >
        {group ? 'Modifier' : 'Créer'}
      </button>
      {group && (
        <button
          type="button"
          onClick={deleteGroup}
          disabled={loading}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 'var(--radius)',
            background: 'transparent',
            color: 'var(--red)',
            fontSize: 16,
            border: 'none',
            cursor: 'pointer',
            marginTop: 8,
          }}
        >
          Supprimer le groupe
        </button>
      )}
    </Sheet>
  );
}

function WorkoutPickerSheet({
  onClose,
  onSelect,
  selectedCount,
  progress,
  error,
  savedWorkouts,
}: {
  onClose: () => void;
  onSelect: (name: string, description: string, sport: string) => void;
  selectedCount: number;
  progress: { current: number; total: number };
  error: string | null;
  savedWorkouts: Array<{ id: string; name: string; sport: Sport; description: string }>;
}) {
  const [selectedWorkout, setSelectedWorkout] = useState<{ name: string; description: string; sport: string } | null>(null);

  if (selectedWorkout) {
    return (
      <Sheet open onClose={onClose} title="Confirmer">
        <div style={{ padding: '16px 0' }}>
          <p style={{ fontSize: 15, margin: '0 0 16px' }}>
            Planifier <b>«{selectedWorkout.name}»</b> pour {selectedCount} athlète{selectedCount > 1 ? 's' : ''} ?
          </p>
          {progress.total > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--label-2)', marginBottom: 8 }}>
                Progression : {progress.current} / {progress.total}
              </div>
              <div style={{ height: 4, background: 'var(--fill-2)', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'var(--tint)',
                    width: `${(progress.current / progress.total) * 100}%`,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          )}
          {error && (
            <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => onSelect(selectedWorkout.name, selectedWorkout.description, selectedWorkout.sport)}
            disabled={progress.total > 0 && progress.current < progress.total}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 'var(--radius)',
              background: 'var(--tint)',
              color: 'var(--label)',
              fontSize: 16,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            {progress.total > 0 && progress.current < progress.total ? 'Planification en cours…' : 'Planifier'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={progress.total > 0 && progress.current < progress.total}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 'var(--radius)',
              background: 'transparent',
              color: 'var(--label-1)',
              fontSize: 16,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Choisir une séance">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Mes séances */}
        {savedWorkouts.length > 0 && (
          <>
            <h3 className="section-header" style={{ margin: '16px 0 8px' }}>Mes séances</h3>
            {savedWorkouts.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWorkout({ name: w.name, description: w.description, sport: w.sport })}
                style={{
                  background: 'var(--cell)',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{w.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--label-2)' }}>{SPORT_LABELS[w.sport]}</div>
                </div>
                <ChevronRight size={20} style={{ color: 'var(--label-2)' }} />
              </button>
            ))}
          </>
        )}

        {/* Séances types */}
        <h3 className="section-header" style={{ margin: '16px 0 8px' }}>Séances types</h3>
        {TEMPLATES.map((t) => (
          <button
            key={`${t.sport}-${t.name}`}
            type="button"
            onClick={() => setSelectedWorkout({ name: t.name, description: t.description, sport: t.sport })}
            style={{
              background: 'var(--cell)',
              border: 'none',
              borderRadius: 12,
              padding: '12px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{t.name}</div>
              <div style={{ fontSize: 13, color: 'var(--label-2)' }}>{SPORT_LABELS[t.sport]}</div>
            </div>
            <ChevronRight size={20} style={{ color: 'var(--label-2)' }} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
