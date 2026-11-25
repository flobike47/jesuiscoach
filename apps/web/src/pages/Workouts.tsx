import { useState } from 'react';
import dayjs from 'dayjs';
import { CalendarRange } from 'lucide-react';
import { Cell, Page, Section, Sheet } from '@/components/ios';
import { AthletePicker } from '@/components/workout/AthletePicker';
import { PlanSheet } from '@/components/workout/PlanSheet';
import { StructureEditor, WorkoutSummary } from '@/components/workout/StructureEditor';
import { useAssignWorkout, useLibrary, usePlans, useTeam } from '@/hooks/useCoach';
import { formatDuration } from '@/lib/format';
import { parseWorkout, TEMPLATES, workoutStats, type WorkoutTemplate } from '@/lib/workout';
import type { TrainingPlan } from '@/types';

const NEW_WORKOUT: WorkoutTemplate = { name: 'Nouvelle séance', description: '- 10m ramp 50-75%\n\n- 30m 70%\n\n- 10m 50%' };

/** Écran « Séances » : séances types, bibliothèque Intervals.icu et plans sur plusieurs semaines. */
export default function Workouts() {
  const [editing, setEditing] = useState<(WorkoutTemplate & { key: string }) | null>(null);
  const [planOpen, setPlanOpen] = useState<{ plan: TrainingPlan | null } | null>(null);
  const library = useLibrary();
  const plans = usePlans();
  const open = (t: WorkoutTemplate, key: string) => setEditing({ ...t, key });

  return (
    <Page title="Séances">
      <Section header="Plans" footer="Une suite de séances sur plusieurs semaines, envoyée d'un coup dans le calendrier des athlètes.">
        {(plans.data?.plans ?? []).map((p) => {
          const weeks = Math.floor(Math.max(0, ...p.workouts.map((w) => w.day)) / 7) + 1;
          return (
            <Cell
              key={p.id}
              inset={52}
              leading={<CalendarRange size={20} color="var(--purple)" aria-hidden />}
              title={p.name}
              subtitle={`${p.workouts.length} séance${p.workouts.length > 1 ? 's' : ''} · ${weeks} semaine${weeks > 1 ? 's' : ''}`}
              onClick={() => setPlanOpen({ plan: p })}
              chevron
            />
          );
        })}
        <Cell onClick={() => setPlanOpen({ plan: null })} title={<span style={{ color: 'var(--tint)' }}>Créer un plan</span>} />
      </Section>

      <Section header="Séances types" footer="Les % sont relatifs à la FTP de chaque athlète. La séance arrive sur sa montre Garmin via Intervals.icu.">
        {TEMPLATES.map((t) => (
          <TemplateCell key={t.name} template={t} onClick={() => open(t, `app-${t.name}`)} />
        ))}
        <Cell onClick={() => open(NEW_WORKOUT, `new-${Date.now()}`)} title={<span style={{ color: 'var(--tint)' }}>Créer une séance</span>} />
      </Section>

      {(library.data?.folders ?? []).map((f) => (
        <Section key={f.id} header={`Intervals.icu · ${f.name}`}>
          {f.workouts.map((w) => (
            <TemplateCell key={w.id} template={w} onClick={() => open(w, `icu-${w.id}`)} />
          ))}
        </Section>
      ))}
      {library.isError && <p className="section-footer">Bibliothèque Intervals.icu indisponible pour le moment.</p>}

      {editing && <WorkoutSheet key={editing.key} template={editing} onClose={() => setEditing(null)} />}
      {planOpen && <PlanSheet key={planOpen.plan?.id ?? 'new'} plan={planOpen.plan} onClose={() => setPlanOpen(null)} />}
    </Page>
  );
}

function TemplateCell({ template, onClick }: { template: WorkoutTemplate; onClick: () => void }) {
  const s = workoutStats(parseWorkout(template.description));
  return (
    <Cell
      onClick={onClick}
      chevron
      title={template.name}
      subtitle={
        s.seconds > 0 ? (
          <span className="tabular-nums">
            {formatDuration(s.seconds)} · charge {s.load} · intensité {s.intensity.toLocaleString('fr-FR')}
          </span>
        ) : undefined
      }
    />
  );
}

function WorkoutSheet({ template, onClose }: { template: WorkoutTemplate; onClose: () => void }) {
  const team = useTeam();
  const assign = useAssignWorkout();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [date, setDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const athletes = team.data?.athletes ?? [];

  const send = async () => {
    setError(null);
    if (!name.trim()) return setError('Donne un nom à la séance.');
    if (parseWorkout(description).length === 0) return setError('La structure ne contient aucun palier lisible (ex. « - 10m 70% »).');
    if (selected.size === 0) return setError('Choisis au moins un athlète.');
    try {
      const { results } = await assign.mutateAsync({ athleteIds: [...selected], date, name: name.trim(), description });
      const failed = results.filter((r) => !r.ok);
      if (failed.length) setError(`${failed.length} envoi(s) en échec : ${failed[0].error ?? 'erreur inconnue'}`);
      else onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Séance"
      action={
        <button type="button" onClick={send} disabled={assign.isPending} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {assign.isPending ? 'Envoi…' : 'Envoyer'}
        </button>
      }
    >
      <div className="group">
        <input className="field" aria-label="Nom de la séance" value={name} onChange={(e) => setName(e.target.value)} style={{ fontWeight: 600 }} />
      </div>

      <div style={{ marginTop: 12 }}>
        <WorkoutSummary description={description} />
      </div>

      <h3 className="section-header">Structure</h3>
      <StructureEditor description={description} onChange={setDescription} />

      <h3 className="section-header">Quand</h3>
      <div className="group">
        <input type="date" className="field" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <AthletePicker athletes={athletes} selected={selected} onChange={setSelected} />

      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}
