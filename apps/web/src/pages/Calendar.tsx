import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Check, Flag, Plus, X, MoreVertical } from 'lucide-react';
import { Page, Placeholder, Segmented, Sheet, SkeletonList } from '@/components/ios';
import { AthletePicker } from '@/components/calendar/AthletePicker';
import { EditEventSheet, NewEventSheet } from '@/components/calendar/EventSheets';
import { MonthPanel } from '@/components/calendar/MonthPanel';
import { useCalendar, useTeam } from '@/hooks/useCoach';
import { useCare } from '@/hooks/useCare';
import { useEventMutations } from '@/hooks/useCalendarData';
import { dayStatus, isDayOpen } from '@/lib/availability';
import { formatRaceDistance, weekLoad, nextFreeDay, shiftWorkouts } from '@/lib/calendar';
import { formatDuration, formatLoad, formatHours, dayShort } from '@/lib/format';
import { parseWorkout, workoutStats, type Sport } from '@/lib/workout';
import { WorkoutProfile } from '@/components/workout/StructureEditor';
import type { AppEvent } from '@/services/calendarApi';

/** Écran 6 (coach) : semaine d'un athlète de l'équipe, au choix. */
export default function Calendar() {
  return <CalendarView />;
}

/**
 * Semaine d'un athlète — séances prévues, compétitions, notes et sorties réalisées.
 * Sans `fixed`, le coach choisit l'athlète ; avec, c'est l'athlète lui-même (« Plan »).
 */
export function CalendarView({ fixed, account }: { fixed?: { id: string; title: string }; account?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const team = useTeam(!fixed);
  const athletes = useMemo(() => [...(team.data?.athletes ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [team.data]);
  const [picked, setPicked] = useState<string | null>(() => searchParams.get('athlete'));
  const athleteId = fixed?.id ?? picked ?? athletes[0]?.id;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(dayjs()));
  const from = weekStart.format('YYYY-MM-DD');
  const to = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const cal = useCalendar(athleteId, from, to);
  // Jours de repos et exceptions de l'athlète : grisés, sans changer le calendrier.
  const care = useCare(athleteId);
  const { create } = useEventMutations();
  const today = dayjs().format('YYYY-MM-DD');
  const [editing, setEditing] = useState<AppEvent | null>(null);
  const [editingInitialDate, setEditingInitialDate] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingDay, setAddingDay] = useState<dayjs.Dayjs | null>(null);
  const [showCopyWeek, setShowCopyWeek] = useState(false);
  const [copyingWeek, setCopyingWeek] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);
  const [view, setView] = useState<'semaine' | 'mois'>(() => (searchParams.get('vue') === 'mois' ? 'mois' : 'semaine'));

  const events = useMemo(() => (cal.data?.events ?? []) as AppEvent[], [cal.data?.events]);
  const doneIds = useMemo(() => new Set(cal.data?.doneEventIds ?? []), [cal.data?.doneEventIds]);

  // Calcul de la charge semaine : une seule fois
  const weekLoadData = useMemo(() => weekLoad(events, cal.data?.activities ?? [], from, to), [events, cal.data?.activities, from, to]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = weekStart.add(i, 'day');
      const key = d.format('YYYY-MM-DD');
      const onDay = (e: AppEvent) => e.start_date_local.startsWith(key);
      const planned = events.filter((e) => e.category === 'WORKOUT' && onDay(e));
      const races = events.filter((e) => e.category?.startsWith('RACE_') && onDay(e));
      const notes = events.filter((e) => e.category === 'NOTE' && onDay(e));
      const done = (cal.data?.activities ?? []).filter((a) => a.start_date_local.startsWith(key));
      return { d, key, planned, races, notes, done };
    });
  }, [weekStart, events, cal.data?.activities]);

  // Statistiques pour la sous-ligne de charge
  const missedCount = useMemo(() => {
    return events.filter((e) => e.category === 'WORKOUT' && e.start_date_local.slice(0, 10) < today && !doneIds.has(String(e.id))).length;
  }, [events, doneIds, today]);

  const upcomingCount = useMemo(() => {
    return events.filter((e) => e.category === 'WORKOUT' && e.start_date_local.slice(0, 10) >= today && !doneIds.has(String(e.id))).length;
  }, [events, doneIds, today]);

  const plannedDuration = useMemo(() => {
    let totalSecs = 0;
    for (const e of events) {
      if (e.category === 'WORKOUT' && inRange(e.start_date_local, from, to)) {
        if (e.description) {
          const steps = parseWorkout(e.description);
          const stats = workoutStats(steps);
          totalSecs += stats.seconds;
        }
      }
    }
    return totalSecs;
  }, [events, from, to]);

  const selectedDay = today >= from && today <= to ? dayjs(today) : weekStart;


  const doCopyWeek = async () => {
    if (!athleteId) return;
    setCopyingWeek(true);
    try {
      const workouts = shiftWorkouts(events, 7);
      for (const workout of workouts) {
        await create.mutateAsync({ athleteId, body: workout });
      }
      setShowCopyWeek(false);
    } catch (err) {
      setResyncError((err as Error).message);
    } finally {
      setCopyingWeek(false);
    }
  };

  const handleViewChange = (newView: typeof view) => {
    setView(newView);
    if (newView === 'mois') {
      setSearchParams((p) => ({ ...Object.fromEntries(p), vue: 'mois' }));
    } else {
      const p = Object.fromEntries(searchParams);
      delete p.vue;
      setSearchParams(p);
    }
  };

  const handlePickAthlete = (id: string) => {
    setPicked(id);
    if (!fixed) {
      setSearchParams((p) => ({ ...Object.fromEntries(p), athlete: id }));
    }
  };

  return (
    <Page
      title={fixed?.title ?? 'Calendrier'}
      account={account ?? !fixed}
      actions={
        athleteId ? (
          <button type="button" onClick={() => setAdding(true)} aria-label="Ajouter au calendrier" style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center' }}>
            <Plus size={24} />
          </button>
        ) : undefined
      }
      header={
        !fixed && athletes.length > 0 ? (
          <AthletePicker athletes={athletes} picked={athleteId ?? null} onPick={handlePickAthlete} />
        ) : undefined
      }
    >
      <Segmented<'semaine' | 'mois'> label="Vue" value={view} onChange={handleViewChange} options={[
        { value: 'semaine', label: 'Semaine' },
        { value: 'mois', label: 'Mois' },
      ]} />

      {view === 'semaine' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 8px' }}>
            <button type="button" aria-label="Semaine précédente" onClick={() => setWeekStart((w) => w.subtract(7, 'day'))} style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}>
              <ChevronLeft size={24} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div className="headline">
                {weekStart.format('D MMM')} – {weekStart.add(6, 'day').format('D MMM')}
              </div>
              {weekStart.startOf('week').format('YYYY-MM-DD') !== startOfWeek(dayjs()).format('YYYY-MM-DD') && (
                <button onClick={() => setWeekStart(startOfWeek(dayjs()))} style={{ color: 'var(--tint)', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Cette semaine
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {!fixed && events.some((e) => e.category === 'WORKOUT') && (
                <button type="button" aria-label="Actions de la semaine" onClick={() => setShowCopyWeek(true)} style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center' }}>
                  <MoreVertical size={24} />
                </button>
              )}
              <button type="button" aria-label="Semaine suivante" onClick={() => setWeekStart((w) => w.add(7, 'day'))} style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}>
                <ChevronRight size={24} />
              </button>
            </div>
          </div>

          {cal.data && (
            <div style={{ background: 'var(--cell)', borderRadius: 'var(--radius)', padding: '12px 14px', margin: '6px 0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                <span>Charge de la semaine</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <b>{formatLoad(weekLoadData.done)}</b> <span style={{ color: 'var(--label-2)' }}>/ {formatLoad(weekLoadData.planned)} prévue</span>
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'rgba(118, 118, 128, .24)', position: 'relative', overflow: 'hidden' }}>
                <span style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: weekLoadData.planned > 0 ? `${Math.min(100, (weekLoadData.done / weekLoadData.planned) * 100)}%` : 0,
                  background: 'repeating-linear-gradient(45deg, rgba(255, 159, 10, .9) 0 4px, rgba(255, 159, 10, .5) 4px 8px)',
                }} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--label-2)' }}>
                {missedCount > 0 && `${missedCount} séance${missedCount > 1 ? 's' : ''} manquée${missedCount > 1 ? 's' : ''} · `}
                {upcomingCount} à venir · {formatHours(plannedDuration)} prévues
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
            {days.map(({ d, key, planned, races, notes, done }) => {
              const status = care.data ? dayStatus(key, care.data) : null;
              const isToday = key === today;
              const hasEvents = planned.length > 0 || races.length > 0 || notes.length > 0;

              return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
                  {/* Colonne gauche : jour et numéro */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, fontSize: 12, color: 'var(--label-2)' }}>
                    <div style={{ fontSize: 12 }}>{dayShort(key)}</div>
                    <div
                      className="tabular-nums"
                      style={{
                        fontSize: isToday ? 17 : 20,
                        fontWeight: 600,
                        color: isToday ? '#fff' : 'var(--label-1)',
                        width: isToday ? 34 : 'auto',
                        height: isToday ? 34 : 'auto',
                        borderRadius: isToday ? '50%' : 0,
                        background: isToday ? 'var(--tint)' : 'transparent',
                        display: 'grid',
                        placeItems: 'center',
                        marginTop: 2,
                      }}
                    >
                      {d.date()}
                    </div>
                  </div>

                  {/* Colonne droite : événements */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Statut du jour (repos/indisponible) */}
                    {status && !hasEvents && (
                      <div style={{ background: 'var(--fill)', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: 'var(--label-2)' }}>
                        {status === 'repos' ? 'Repos habituel' : 'Indisponible'}
                      </div>
                    )}

                    {/* Séances */}
                    {planned.map((e, i) => {
                      const made = e.id != null && doneIds.has(String(e.id));
                      const missed = !made && key < today;
                      const steps = e.description ? parseWorkout(e.description) : [];
                      const stats = workoutStats(steps);
                      const sport = (e.type ?? 'Ride') as Sport;

                      return (
                        <div key={`p${i}`} style={{ background: 'var(--cell)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {made ? (
                              <Check size={16} color="var(--green)" aria-label="Faite" style={{ flexShrink: 0 }} />
                            ) : missed ? (
                              <X size={16} color="var(--red)" aria-label="Manquée" style={{ flexShrink: 0 }} />
                            ) : (
                              <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--tint)', flexShrink: 0 }} aria-label="À venir" />
                            )}
                            <span style={{ flex: 1, fontSize: 16 }}>{e.name ?? 'Séance'}</span>
                            {stats.seconds > 0 && (
                              <span style={{ fontSize: 13, color: 'var(--label-2)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                {formatDuration(stats.seconds)} · {formatLoad(stats.load)}
                              </span>
                            )}
                            {missed && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!care.data) return;
                                  const busy = new Set(planned.map((x) => x.start_date_local.slice(0, 10)));
                                  const nextDay = nextFreeDay(key, busy, (day) => !isDayOpen(day, care.data), 14);
                                  if (nextDay) {
                                    setEditing(e);
                                    setEditingInitialDate(nextDay);
                                  }
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--tint)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, minHeight: 'auto' }}
                              >
                                Reporter
                              </button>
                            )}
                          </div>
                          {steps.length > 0 && <WorkoutProfile steps={steps} sport={sport} height={22} />}
                        </div>
                      );
                    })}

                    {/* Compétitions */}
                    {races.map((e) => (
                      <div key={`r${String(e.id)}`} style={{ background: 'var(--cell)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flag size={16} color="var(--orange)" aria-label="Compétition" style={{ flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 16 }}>{e.name ?? 'Compétition'}</span>
                          {e.racePriority && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', background: 'rgba(255, 159, 10, .16)', borderRadius: 5, padding: '2px 6px', flexShrink: 0 }}>
                              {e.racePriority}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--label-2)' }}>
                          {[e.racePriority ? `Priorité ${e.racePriority}` : null, formatRaceDistance(e.raceDistanceM ?? null)].filter(Boolean).join(' · ') || 'Compétition'}
                        </div>
                        {e.raceGoal && <div style={{ fontSize: 13, color: 'var(--label-2)' }}>{e.raceGoal}</div>}
                      </div>
                    ))}

                    {/* Notes */}
                    {notes.map((e) => (
                      <div key={`n${String(e.id)}`} style={{ background: 'var(--cell)', borderRadius: 12, padding: '10px 12px', fontSize: 13 }}>
                        {e.name ?? 'Note'}
                      </div>
                    ))}

                    {/* Sorties hors plan */}
                    {done.filter(() => planned.length === 0).map((a) => (
                      <div key={a.id} style={{ background: 'var(--cell)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Check size={16} color="var(--label-2)" style={{ flexShrink: 0 }} aria-hidden />
                          <span style={{ flex: 1, fontSize: 16 }}>{a.name ?? 'Sortie'}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--label-2)' }}>Hors plan · {formatDuration(a.moving_time)}</div>
                      </div>
                    ))}

                    {/* Bouton Ajouter si jour libre et sans événement */}
                    {!hasEvents && !status && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(true);
                          setAddingDay(d);
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px dashed rgba(10, 132, 255, .6)',
                          borderRadius: 12,
                          color: 'var(--tint)',
                          fontSize: 15,
                          fontWeight: 600,
                          minHeight: 44,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          padding: '10px 12px',
                        }}
                      >
                        <Plus size={16} />
                        Ajouter
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {cal.isLoading && <SkeletonList rows={4} avatar={false} />}
      {cal.error && <Placeholder title="Calendrier indisponible">{cal.error.message}</Placeholder>}
      {resyncError && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {resyncError}
        </p>
      )}

      {view === 'mois' && (
        athleteId ? (
          <MonthPanel
            athleteId={athleteId}
            unavailable={(day) => (care.data ? dayStatus(day, care.data) : null)}
            onEdit={(e) => setEditing(e)}
          />
        ) : null
      )}

      {editing && athleteId && (
        <EditEventSheet key={String(editing.id)} athleteId={athleteId} event={editing} weekStart={weekStart} initialDate={editingInitialDate ?? undefined} onClose={() => { setEditing(null); setEditingInitialDate(null); }} />
      )}
      {adding && athleteId && <NewEventSheet athleteId={athleteId} weekStart={weekStart} defaultDay={addingDay ?? selectedDay} onClose={() => { setAdding(false); setAddingDay(null); }} />}

      {showCopyWeek && (
        <Sheet open onClose={() => setShowCopyWeek(false)} title="Actions de la semaine">
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 15, margin: '0 0 12px' }}>
              {events.filter((e) => e.category === 'WORKOUT').length} séance{events.filter((e) => e.category === 'WORKOUT').length > 1 ? 's' : ''} seront ajoutées du {weekStart.add(7, 'day').format('D MMM')} au {weekStart.add(13, 'day').format('D MMM')}.
            </p>
            <button
              type="button"
              onClick={doCopyWeek}
              disabled={copyingWeek}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 'var(--radius)',
                background: 'var(--tint)',
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {copyingWeek ? 'Copie en cours…' : 'Copier'}
            </button>
            <button
              type="button"
              onClick={() => setShowCopyWeek(false)}
              disabled={copyingWeek}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 'var(--radius)',
                background: 'transparent',
                color: 'var(--label-1)',
                fontSize: 16,
                border: 'none',
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Annuler
            </button>
          </div>
        </Sheet>
      )}
    </Page>
  );
}

function startOfWeek(d: dayjs.Dayjs): dayjs.Dayjs {
  // Semaine du lundi au dimanche.
  const offset = (d.day() + 6) % 7;
  return d.subtract(offset, 'day').startOf('day');
}

/** Date locale (« 2026-11-29T10:00:00 ») comprise entre deux jours inclus (« 2026-11-23 » → « 2026-11-29 »). */
function inRange(local: string, from: string, to: string): boolean {
  const day = local.slice(0, 10);
  return day >= from && day <= to;
}

