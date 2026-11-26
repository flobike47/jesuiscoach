import { useState } from 'react';
import dayjs from 'dayjs';
import { Cell, Page, Placeholder, Section, Segmented, Sheet } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { NumberStepper } from '@/components/common/NumberStepper';
import { useProfileTarget } from '@/hooks/useProfileTarget';
import { useEventMutations, useGoalMutations, useGoals } from '@/hooks/useCalendarData';
import { countdownLabel, daysBetween, formatRaceDistance, formatTarget, METRIC_LABEL, PRIORITY_LABEL } from '@/lib/calendar';
import type { Goal, GoalMetric, Race, RacePriority } from '@/services/calendarApi';

/** Page « Objectifs et compétitions » de la fiche profil. */
export default function GoalsPage() {
  const { athleteId, base } = useProfileTarget();
  const { data, isLoading, error, refetch } = useGoals(athleteId);
  const [race, setRace] = useState<Race | 'new' | null>(null);
  const [goal, setGoal] = useState<Goal | 'new' | null>(null);
  const today = dayjs().format('YYYY-MM-DD');
  const races = data?.races ?? [];
  const goals = data?.goals ?? [];

  return (
    <Page title="Objectifs" back={{ to: base, label: 'Profil' }}>
      {isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}
      {error && (
        <Placeholder title="Objectifs indisponibles" action={<button type="button" className="button tinted pressable" onClick={() => refetch()}>Réessayer</button>}>
          {(error as Error).message}
        </Placeholder>
      )}

      {athleteId && data && (
        <>
          <Section
            header="Prochaines compétitions"
            footer="Une compétition part dans le calendrier Intervals.icu, comme une séance."
          >
            {races.map((r) => (
              <Cell
                key={r.id}
                title={`${r.name}`}
                subtitle={[PRIORITY_LABEL[r.racePriority], formatRaceDistance(r.raceDistanceM), r.raceGoal].filter(Boolean).join(' · ')}
                detail={countdownLabel(daysBetween(r.date, today))}
                onClick={() => setRace(r)}
                chevron
              />
            ))}
            <Cell title={<span style={{ color: 'var(--tint)' }}>Ajouter une compétition</span>} onClick={() => setRace('new')} />
          </Section>

          <Section header="Objectifs" footer="Un objectif peut être lié à une compétition.">
            {goals.map((g) => (
              <Cell
                key={g.id}
                title={g.title}
                subtitle={[g.metric ? METRIC_LABEL[g.metric] : null, g.targetValue != null ? formatTarget(g.metric, g.targetValue) : null, g.dueDay ? `avant le ${dayjs(g.dueDay).format('D MMM')}` : null]
                  .filter(Boolean)
                  .join(' · ')}
                leading={g.achievedOn ? <span aria-label="Atteint" style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span> : undefined}
                onClick={() => setGoal(g)}
                chevron
              />
            ))}
            <Cell title={<span style={{ color: 'var(--tint)' }}>Ajouter un objectif</span>} onClick={() => setGoal('new')} />
          </Section>

          {race && <RaceSheet key={race === 'new' ? 'new' : race.id} athleteId={athleteId} race={race === 'new' ? null : race} onClose={() => setRace(null)} />}
          {goal && <GoalSheet key={goal === 'new' ? 'new' : goal.id} athleteId={athleteId} goal={goal === 'new' ? null : goal} races={races} onClose={() => setGoal(null)} />}
        </>
      )}
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : prochaine compétition et nombre d'objectifs en cours. */
export function GoalsRow({ athleteId, base }: RowProps) {
  const { data } = useGoals(athleteId);
  const today = dayjs().format('YYYY-MM-DD');
  const next = data?.races[0];
  const open = (data?.goals ?? []).filter((g) => !g.achievedOn).length;
  const summary = [next && `${next.name} ${countdownLabel(daysBetween(next.date, today))}`, open ? `${open} objectif${open > 1 ? 's' : ''}` : null]
    .filter(Boolean)
    .join(' · ');
  return <Cell title="Objectifs et compétitions" subtitle={summary || undefined} to={`${base}/objectifs`} chevron />;
}

/** Feuille d'une compétition : créer, modifier ou supprimer. */
function RaceSheet({ athleteId, race, onClose }: { athleteId: string; race: Race | null; onClose: () => void }) {
  const { create, update, remove } = useEventMutations();
  const [name, setName] = useState(race?.name ?? '');
  const [date, setDate] = useState(race?.date ?? dayjs().add(1, 'month').format('YYYY-MM-DD'));
  const [priority, setPriority] = useState<RacePriority>(race?.racePriority ?? 'B');
  const [km, setKm] = useState<number | null>(race?.raceDistanceM != null ? Math.round(race.raceDistanceM / 100) / 10 : null);
  const [goalText, setGoalText] = useState(race?.raceGoal ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const save = async () => {
    setError(null);
    if (!name.trim() || !date) return setError('Nom et date requis.');
    const body = {
      name: name.trim(),
      date,
      racePriority: priority,
      raceDistanceM: km ? Math.round(km * 1000) : null,
      raceGoal: goalText.trim() || null,
    };
    try {
      if (race) await update.mutateAsync({ athleteId, eventId: race.id, body });
      else await create.mutateAsync({ athleteId, body: { kind: 'race', ...body } });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const destroy = async () => {
    if (!race) return;
    if (!confirmDelete) return setConfirmDelete(true);
    try {
      await remove.mutateAsync({ athleteId, eventId: race.id });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={race ? 'Compétition' : 'Nouvelle compétition'}
      action={
        <button type="button" onClick={save} disabled={busy} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {busy ? 'Envoi…' : 'OK'}
        </button>
      }
    >
      <div className="group">
        <input className="field" aria-label="Nom de la compétition" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <input className="field" type="date" aria-label="Date de la compétition" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <h3 className="section-header">Priorité</h3>
      <Segmented<RacePriority>
        label="Priorité"
        value={priority}
        onChange={setPriority}
        options={[
          { value: 'A', label: 'A' },
          { value: 'B', label: 'B' },
          { value: 'C', label: 'C' },
        ]}
      />
      <div style={{ marginTop: 12 }}>
        <NumberStepper label="Distance" value={km} onChange={setKm} min={0} max={1000} step={1} unit="km" />
      </div>
      <div className="group" style={{ marginTop: 12 }}>
        <input className="field" aria-label="Objectif" placeholder="Objectif (ex. finir en 4 h 30)" value={goalText} onChange={(e) => setGoalText(e.target.value)} maxLength={200} />
      </div>

      {race && (
        <div className="group" style={{ marginTop: 28 }}>
          <button type="button" className="cell" onClick={destroy} disabled={busy} style={{ color: 'var(--red)', justifyContent: 'center' }}>
            {confirmDelete ? 'Confirmer la suppression' : 'Supprimer la compétition'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}

const METRICS = Object.keys(METRIC_LABEL) as GoalMetric[];

/** Feuille d'un objectif : créer, modifier, marquer atteint, supprimer. */
function GoalSheet({ athleteId, goal, races, onClose }: { athleteId: string; goal: Goal | null; races: Race[]; onClose: () => void }) {
  const { create, update, remove } = useGoalMutations();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [metric, setMetric] = useState<GoalMetric | ''>(goal?.metric ?? '');
  const [target, setTarget] = useState<number | null>(goal?.targetValue ?? null);
  const [dueDay, setDueDay] = useState(goal?.dueDay ?? '');
  const [raceId, setRaceId] = useState(goal?.raceId ?? '');
  const [achievedOn, setAchievedOn] = useState<string | null>(goal?.achievedOn ?? null);
  const [note, setNote] = useState(goal?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const save = async () => {
    setError(null);
    if (!title.trim()) return setError('Un titre est requis.');
    const body = {
      title: title.trim(),
      metric: metric || null,
      targetValue: metric ? target : null,
      dueDay: dueDay || null,
      raceId: raceId || null,
      achievedOn,
      note: note.trim() || null,
    };
    try {
      if (goal) await update.mutateAsync({ athleteId, goalId: goal.id, body });
      else await create.mutateAsync({ athleteId, body });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const destroy = async () => {
    if (!goal) return;
    if (!confirmDelete) return setConfirmDelete(true);
    try {
      await remove.mutateAsync({ athleteId, goalId: goal.id });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={goal ? 'Objectif' : 'Nouvel objectif'}
      action={
        <button type="button" onClick={save} disabled={busy} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {busy ? 'Envoi…' : 'OK'}
        </button>
      }
    >
      <div className="group">
        <input className="field" aria-label="Titre de l’objectif" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <select className="field" aria-label="Métrique" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric | '')}>
          <option value="">Sans mesure</option>
          {METRICS.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABEL[m]}
            </option>
          ))}
        </select>
        <input className="field" type="date" aria-label="Échéance" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        <select className="field" aria-label="Compétition liée" value={raceId} onChange={(e) => setRaceId(e.target.value)}>
          <option value="">Aucune compétition</option>
          {races.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {metric && (
        <div style={{ marginTop: 12 }}>
          <NumberStepper label="Valeur cible" value={target} onChange={setTarget} min={0} max={99999} step={1} />
        </div>
      )}
      <div className="group" style={{ marginTop: 12 }}>
        <input className="field" aria-label="Note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>

      {goal && (
        <div className="group" style={{ marginTop: 28 }}>
          <button type="button" className="cell" onClick={() => setAchievedOn(achievedOn ? null : dayjs().format('YYYY-MM-DD'))} style={{ justifyContent: 'center' }}>
            {achievedOn ? `Atteint le ${dayjs(achievedOn).format('D MMM YYYY')} · annuler` : 'Marquer comme atteint'}
          </button>
          <button type="button" className="cell" onClick={destroy} disabled={busy} style={{ color: 'var(--red)', justifyContent: 'center' }}>
            {confirmDelete ? 'Confirmer la suppression' : 'Supprimer l’objectif'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}
