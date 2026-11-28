import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Check, ChevronRight, Circle, Flag, X } from 'lucide-react';
import { Placeholder, SkeletonList } from '@/components/ios';
import { MonthView } from '@/components/calendar/MonthView';
import { RestCard } from '@/components/calendar/RestDay';
import { WorkoutProfile } from '@/components/workout/StructureEditor';
import { useCalendar } from '@/hooks/useCoach';
import { useActivityLink } from '@/hooks/useActivityLink';
import { useEventMutations, useGoals } from '@/hooks/useCalendarData';
import { setNavDirection } from '@/lib/navTransition';
import { nextRace, raceSubtitle, raceWeekLabel } from '@/lib/raceWeeks';
import { monthGrid } from '@/lib/calendar';
import { isPrescribedRest } from '@/lib/restDay';
import { formatDuration, formatLoad } from '@/lib/format';
import { parseWorkout, workoutStats, type Sport } from '@/lib/workout';
import type { AppEvent } from '@/services/calendarApi';

type Picking = { mode: 'move' | 'copy'; event: AppEvent } | null;

/**
 * Vue mois d'un athlète : une seule requête pour toute la grille, détail du
 * jour touché, et déplacement / duplication par « toucher le jour d'arrivée ».
 */
export function MonthPanel({
  athleteId,
  unavailable,
  onEdit,
  restEditable = true,
}: {
  athleteId: string;
  unavailable: (day: string) => 'repos' | 'indisponible' | null;
  /** Ouvre la feuille de l'événement ; `activityId` : la sortie qui réalise la séance, s'il y en a une. */
  onEdit: (e: AppEvent, activityId?: string | null) => void;
  /** Le coach modifie un repos prescrit ; l'athlète le voit en lecture seule. */
  restEditable?: boolean;
}) {
  const today = dayjs().format('YYYY-MM-DD');
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [selected, setSelected] = useState<string | null>(today);
  const [picking, setPicking] = useState<Picking>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { create, update, remove } = useEventMutations();
  const race = nextRace(useGoals(athleteId).data?.races, today);

  const grid = useMemo(() => monthGrid(month.format('YYYY-MM-DD')), [month]);
  const from = grid[0][0].date;
  const to = grid[grid.length - 1][6].date;
  const cal = useCalendar(athleteId, from, to);
  const events = (cal.data?.events ?? []) as AppEvent[];
  const activities = cal.data?.activities ?? [];
  const doneIds = new Set(cal.data?.doneEventIds ?? []);
  const activityByEvent = cal.data?.activityByEvent ?? {};
  const paired = new Set(Object.values(activityByEvent));
  const activityLink = useActivityLink();

  const onDay = (day: string) => events.filter((e) => e.start_date_local.slice(0, 10) === day);
  // Sorties du jour non appariées à une séance (les autres s'ouvrent depuis leur séance).
  const dayActivities = selected ? activities.filter((a) => a.start_date_local.slice(0, 10) === selected && !paired.has(String(a.id))) : [];

  const pick = async (day: string) => {
    if (!picking) return;
    const { mode, event } = picking;
    setPicking(null);
    setMessage(null);
    try {
      if (mode === 'move') {
        await update.mutateAsync({ athleteId, eventId: String(event.id), body: { date: day } });
      } else {
        await create.mutateAsync({
          athleteId,
          body: { kind: 'workout', date: day, name: event.name ?? 'Séance', sport: (event.type as Sport | undefined) ?? 'Ride', description: event.description ?? '' },
        });
      }
      setSelected(day);
      setMessage(mode === 'move' ? `Séance déplacée au ${dayjs(day).format('D MMMM')}.` : `Séance dupliquée le ${dayjs(day).format('D MMMM')}.`);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const destroy = async (event: AppEvent) => {
    if (!window.confirm(`Supprimer « ${event.name ?? 'Séance'} » ? Elle disparaîtra aussi de la montre.`)) return;
    try {
      await remove.mutateAsync({ athleteId, eventId: String(event.id) });
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <MonthView
        subtitle={race ? raceSubtitle(race, today) : null}
        weekLabel={(monday) => (dayjs(monday).add(6, 'day').format('YYYY-MM-DD') >= today ? raceWeekLabel(monday, race) : null)}
        month={month.format('YYYY-MM-DD')}
        events={events}
        activities={activities}
        doneEventIds={cal.data?.doneEventIds ?? []}
        unavailable={unavailable}
        today={today}
        selected={selected}
        onSelect={setSelected}
        onPrevMonth={() => setMonth((m) => m.subtract(1, 'month'))}
        onNextMonth={() => setMonth((m) => m.add(1, 'month'))}
        picking={
          picking
            ? {
                label: picking.mode === 'move' ? 'Touche le jour d’arrivée' : 'Touche le jour où la dupliquer',
                onPick: pick,
                onCancel: () => setPicking(null),
              }
            : null
        }
      />

      {cal.isLoading && <SkeletonList rows={3} avatar={false} />}
      {cal.error && <Placeholder title="Calendrier indisponible">{cal.error.message}</Placeholder>}
      {message && (
        <p role="status" className="footnote secondary" style={{ margin: '12px 4px 0' }}>
          {message}
        </p>
      )}

      {selected && cal.data && (
        <div className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <div className="headline">{capitalize(dayjs(selected).format('dddd D MMMM'))}</div>
          {onDay(selected).length === 0 && dayActivities.length === 0 && (
            <p className="footnote secondary" style={{ margin: 0 }}>
              {unavailable(selected) === 'repos' ? 'Repos habituel.' : unavailable(selected) ? 'Indisponible.' : 'Rien de prévu. Le « + » en haut ajoute une séance.'}
            </p>
          )}
          {onDay(selected).map((e) => {
            if (isPrescribedRest(e)) return <RestCard key={String(e.id)} event={e} onEdit={restEditable ? () => onEdit(e) : undefined} />;
            const workout = e.category === 'WORKOUT';
            const steps = workout ? parseWorkout(e.description ?? '') : [];
            const stats = workoutStats(steps);
            const made = e.id != null && doneIds.has(String(e.id));
            const missed = workout && !made && selected < today;
            const Icon = e.category?.startsWith('RACE_') ? Flag : made ? Check : missed ? X : Circle;
            const color = e.category?.startsWith('RACE_') ? 'var(--orange)' : made ? 'var(--green)' : missed ? 'var(--red)' : 'var(--blue)';
            return (
              <div key={String(e.id)} style={{ display: 'grid', gap: 8 }}>
                <button
                  type="button"
                  className="pressable"
                  onClick={() => onEdit(e, e.id != null ? activityByEvent[String(e.id)] : undefined)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', minHeight: 44 }}
                >
                  <Icon size={16} color={color} strokeWidth={2.8} aria-label={made ? 'Faite' : missed ? 'Manquée' : 'Prévue'} />
                  <span style={{ flex: 1, minWidth: 0 }}>{e.name ?? 'Séance'}</span>
                  {workout && stats.seconds > 0 && (
                    <span className="footnote secondary tabular-nums">
                      {formatDuration(stats.seconds)} · {formatLoad(stats.load)}
                    </span>
                  )}
                </button>
                {steps.length > 0 && <WorkoutProfile steps={steps} sport={(e.type as Sport | undefined) ?? 'Ride'} height={22} />}
                {workout && e.id != null && !made && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="button tinted pressable" style={{ flex: 1, minHeight: 40, fontSize: 14 }} onClick={() => setPicking({ mode: 'move', event: e })}>
                      Déplacer
                    </button>
                    <button type="button" className="button tinted pressable" style={{ flex: 1, minHeight: 40, fontSize: 14 }} onClick={() => setPicking({ mode: 'copy', event: e })}>
                      Dupliquer
                    </button>
                    <button type="button" className="button tinted pressable" style={{ flex: 1, minHeight: 40, fontSize: 14, color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 14%, transparent)' }} onClick={() => destroy(e)}>
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {dayActivities.map((a) => {
            const link = activityLink(athleteId, String(a.id));
            return (
              <Link
                key={a.id}
                to={link.to}
                state={link.state}
                viewTransition
                onClick={() => setNavDirection('forward')}
                className="pressable"
                style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, color: 'inherit', textDecoration: 'none' }}
              >
                <Check size={16} color="var(--label-2)" aria-hidden />
                <span style={{ flex: 1 }}>{a.name ?? 'Sortie'}</span>
                <span className="footnote secondary tabular-nums">Hors plan · {formatDuration(a.moving_time)}</span>
                <ChevronRight size={16} color="var(--label-3)" aria-hidden />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
