import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Avatar, Cell, Page, Section, Sheet } from '@/components/ios';
import { useAssignWorkout, useTeam } from '@/hooks/useCoach';
import { formatDuration } from '@/lib/format';
import { parseWorkout, TEMPLATES, workoutStats, zoneColor, type Step, type WorkoutTemplate } from '@/lib/workout';

/** Écran « Séances » : bibliothèque + éditeur en feuille pour envoyer au calendrier. */
export default function Workouts() {
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null);

  return (
    <Page title="Séances">
      <Section header="Bibliothèque" footer="Les % sont relatifs à la FTP de chaque athlète. La séance arrive sur sa montre Garmin via Intervals.icu.">
        {TEMPLATES.map((t) => {
          const s = workoutStats(parseWorkout(t.description));
          return (
            <Cell
              key={t.name}
              onClick={() => setEditing(t)}
              chevron
              title={t.name}
              subtitle={
                <span className="tabular-nums">
                  {formatDuration(s.seconds)} · charge {s.load} · intensité {s.intensity.toLocaleString('fr-FR')}
                </span>
              }
            />
          );
        })}
        <Cell onClick={() => setEditing({ name: 'Nouvelle séance', description: '- 10m ramp 50-75%\n\n- 30m 70%\n\n- 10m 50%' })} title={<span style={{ color: 'var(--tint)' }}>Créer une séance</span>} />
      </Section>

      {editing && <WorkoutSheet key={editing.name} template={editing} onClose={() => setEditing(null)} />}
    </Page>
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
  const steps = useMemo(() => parseWorkout(description), [description]);
  const stats = workoutStats(steps);
  const athletes = team.data?.athletes ?? [];

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setError(null);
    if (!name.trim()) return setError('Donne un nom à la séance.');
    if (steps.length === 0) return setError('La structure ne contient aucun palier lisible (ex. « - 10m 70% »).');
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

      <div className="card" style={{ marginTop: 12, background: 'var(--cell-2)' }}>
        <WorkoutProfile steps={steps} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 8 }} className="tabular-nums">
          <div>
            <div className="caption secondary">Durée</div>
            <div style={{ fontWeight: 600 }}>{formatDuration(stats.seconds)}</div>
          </div>
          <div>
            <div className="caption secondary">Charge estimée</div>
            <div style={{ fontWeight: 600 }}>{stats.load}</div>
          </div>
          <div>
            <div className="caption secondary">Intensité</div>
            <div style={{ fontWeight: 600 }}>{stats.intensity.toLocaleString('fr-FR')}</div>
          </div>
        </div>
      </div>

      <h3 className="section-header">Structure</h3>
      <div className="group">
        <textarea className="field" aria-label="Structure de la séance" value={description} onChange={(e) => setDescription(e.target.value)} spellCheck={false} />
      </div>
      <p className="section-footer">Une ligne par palier : « - 10m 95-100% », « - 15m ramp 50-75% ». « 3x » répète les paliers suivants jusqu’à la ligne vide.</p>

      <h3 className="section-header">Quand</h3>
      <div className="group">
        <input type="date" className="field" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <h3 className="section-header">
        Athlètes{' '}
        <button
          type="button"
          style={{ float: 'right', color: 'var(--tint)', textTransform: 'none' }}
          onClick={() => setSelected(selected.size === athletes.length ? new Set() : new Set(athletes.map((a) => a.id)))}
        >
          {selected.size === athletes.length && athletes.length > 0 ? 'Aucun' : 'Tous'}
        </button>
      </h3>
      <div className="group">
        {athletes.map((a) => (
          <Cell
            key={a.id}
            onClick={() => toggle(a.id)}
            inset={64}
            leading={<Avatar name={a.name} />}
            title={a.name}
            subtitle={a.ftp ? `FTP ${a.ftp} W` : undefined}
            detail={
              <span
                role="checkbox"
                aria-checked={selected.has(a.id)}
                aria-label={a.name}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: selected.has(a.id) ? 'none' : '1.5px solid var(--label-3)',
                  background: selected.has(a.id) ? 'var(--tint)' : 'transparent',
                  color: '#fff',
                  fontSize: 14,
                }}
              >
                {selected.has(a.id) ? '✓' : ''}
              </span>
            }
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** Profil de la séance : largeur = durée, hauteur = intensité, couleur = zone. */
function WorkoutProfile({ steps }: { steps: Step[] }) {
  const total = steps.reduce((s, x) => s + x.seconds, 0) || 1;
  const max = Math.max(130, ...steps.map((s) => Math.max(s.from, s.to)));
  const H = 64;
  let x = 0;
  return (
    <svg viewBox={`0 0 300 ${H}`} width="100%" height={H} role="img" aria-label="Profil de la séance" preserveAspectRatio="none">
      {steps.map((s, i) => {
        const w = (s.seconds / total) * 300;
        const y1 = H - (s.from / max) * H;
        const y2 = H - (s.to / max) * H;
        const d = `M${x},${H} L${x},${y1} L${x + w},${y2} L${x + w},${H} Z`;
        x += w;
        return <path key={i} d={d} fill={zoneColor((s.from + s.to) / 2)} stroke="var(--cell-2)" strokeWidth={0.6} />;
      })}
    </svg>
  );
}
