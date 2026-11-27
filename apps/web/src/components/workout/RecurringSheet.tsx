import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Sheet } from '@/components/ios';
import { NumberStepper } from '@/components/common/NumberStepper';
import { useTeam } from '@/hooks/useCoach';
import { useApplyWorkouts } from '@/hooks/useBatchSend';
import { sendProblem, sendReport } from '@/lib/batchSend';
import { RECURRENCE_MAX_WEEKS, WEEKDAY_NAMES, recurrenceRange, recurrenceWorkouts } from '@/lib/recurrence';
import { parseWorkout, SPORT_LABELS } from '@/lib/workout';
import { AthletePicker } from './AthletePicker';
import { SourcePicker, type Source } from './PlanSheet';
import { WorkoutProfile } from './StructureEditor';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const fmt = (day: string) => dayjs(day).format('ddd D MMM');

/**
 * Séance récurrente : la même séance certains jours de la semaine, pendant
 * N semaines (12 au plus), pour un ou plusieurs athlètes. Les séances sont
 * créées d'un coup, indépendantes les unes des autres.
 */
export function RecurringSheet({ onClose }: { onClose: () => void }) {
  const team = useTeam();
  const apply = useApplyWorkouts();
  const athletes = useMemo(() => [...(team.data?.athletes ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [team.data]);
  const [workout, setWorkout] = useState<Source | null>(null);
  const [picking, setPicking] = useState(true);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [start, setStart] = useState(() => dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [weeks, setWeeks] = useState(8);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const workouts = useMemo(() => (workout ? recurrenceWorkouts(workout, start, weekdays, weeks) : []), [workout, start, weekdays, weeks]);
  const range = recurrenceRange(
    start,
    workouts.map((w) => w.day),
  );
  const writes = workouts.length * selected.size;
  const problem = !workout
    ? 'Choisis une séance.'
    : weekdays.length === 0
      ? 'Choisis au moins un jour de la semaine.'
      : sendProblem(workouts.length, selected.size);

  const toggleDay = (d: number) => setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const run = async () => {
    setMessage(null);
    try {
      const { total, results } = await apply.mutateAsync({ workouts, athleteIds: [...selected], startDate: start });
      setMessage(sendReport(total, results, (id) => athletes.find((a) => a.id === id)?.name ?? id));
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <Sheet open onClose={onClose} title="Séance récurrente">
      {picking || !workout ? (
        <SourcePicker
          onPick={(w) => {
            setWorkout(w);
            setPicking(false);
          }}
          onCancel={() => (workout ? setPicking(false) : onClose())}
        />
      ) : (
        <>
          <h3 className="section-header">Séance</h3>
          <div className="group" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
            <span style={{ width: 64, flex: 'none' }}>
              <WorkoutProfile steps={parseWorkout(workout.description)} sport={workout.sport ?? 'Ride'} height={26} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workout.name}</b>
              <span className="footnote secondary">{SPORT_LABELS[workout.sport ?? 'Ride']}</span>
            </span>
            <button type="button" onClick={() => setPicking(true)} style={{ color: 'var(--tint)', minHeight: 44 }}>
              Changer
            </button>
          </div>

          <h3 className="section-header">Chaque semaine, le</h3>
          <div className="chips" role="group" aria-label="Jours de la semaine">
            {WEEKDAY_NAMES.map((name, d) => (
              <button key={name} type="button" className={weekdays.includes(d) ? 'chip active' : 'chip'} aria-pressed={weekdays.includes(d)} aria-label={name} onClick={() => toggleDay(d)}>
                {name.slice(0, 3)}.
              </button>
            ))}
          </div>

          <h3 className="section-header">Période</h3>
          <div className="group">
            <input type="date" className="field" aria-label="À partir du" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </div>
          <div className="group" style={{ padding: '8px 16px', marginTop: 8 }}>
            <NumberStepper label="Semaines" value={weeks} onChange={setWeeks} min={1} max={RECURRENCE_MAX_WEEKS} step={1} />
          </div>
          <p className="section-footer tabular-nums">
            {range ? `De ${fmt(range.first)} à ${fmt(range.last)} : ${plural(workouts.length, 'occurrence')}.` : 'Aucune occurrence pour le moment.'} {RECURRENCE_MAX_WEEKS} semaines au plus.
          </p>

          <AthletePicker athletes={athletes} selected={selected} onChange={setSelected} />

          <p role="status" className="footnote tabular-nums" style={{ margin: '14px 4px 0' }}>
            {plural(workouts.length, 'occurrence')} × {plural(selected.size, 'athlète')} = <b>{plural(writes, 'séance')} à créer</b>, chacune envoyée à
            Intervals.icu{workouts.length > 0 && ` (${workouts.length} par athlète, sur son quota de 100 requêtes par jour)`}.
          </p>
          {problem && (
            <p role="alert" className="footnote" style={{ color: 'var(--orange)', margin: '8px 4px 0' }}>
              {problem}
            </p>
          )}
          <button type="button" className="button filled block pressable" style={{ marginTop: 14 }} disabled={apply.isPending || problem != null || message?.ok === true} onClick={run}>
            {apply.isPending ? 'Envoi…' : message?.ok ? 'Séances programmées' : `Programmer ${plural(writes, 'séance')}`}
          </button>
          <p className="section-footer">
            Ce ne sont pas des séances liées : chacune se modifie, se déplace ou se supprime seule dans le calendrier. Au plus 40 occurrences et 120 envois à la
            fois.
          </p>
          {message && (
            <p role={message.ok ? 'status' : 'alert'} className="footnote" style={{ color: message.ok ? 'var(--green)' : 'var(--red)', margin: '10px 4px 0' }}>
              {message.text}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
