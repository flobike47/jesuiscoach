import { useMemo, useState } from 'react';
import { Segmented } from '@/components/ios';
import { formatDuration } from '@/lib/format';
import { parseWorkout, workoutStats, zoneColor, type Step } from '@/lib/workout';
import { blocksToText, isBlockEditable, textToBlocks, type Block } from '@/lib/workoutBlocks';
import { BlockEditor } from './BlockEditor';

type Mode = 'blocks' | 'text';

/**
 * Structure d'une séance : éditeur par blocs (par défaut) ou texte au format
 * Intervals.icu. Le texte reste la valeur échangée avec le parent.
 */
export function StructureEditor({ description, onChange }: { description: string; onChange: (text: string) => void }) {
  const editable = isBlockEditable(description);
  const [mode, setMode] = useState<Mode>(editable ? 'blocks' : 'text');
  const [blocks, setBlocks] = useState<Block[]>(() => (editable ? textToBlocks(description) : []));
  const [notice, setNotice] = useState<string | null>(editable ? null : 'Cette séance utilise des options que l’éditeur par blocs ne gère pas (cadence, zones, cardio…) : elle reste en mode texte.');

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    if (next === 'blocks') {
      if (!isBlockEditable(description)) {
        setNotice('Le texte contient des options que l’éditeur par blocs ne gère pas (cadence, zones, cardio…) : il reste en mode texte.');
        return;
      }
      setBlocks(textToBlocks(description));
    }
    setNotice(null);
    setMode(next);
  };

  const changeBlocks = (next: Block[]) => {
    setBlocks(next);
    onChange(blocksToText(next));
  };

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <Segmented<Mode>
          label="Mode d'édition"
          value={mode}
          onChange={switchTo}
          options={[
            { value: 'blocks', label: 'Blocs' },
            { value: 'text', label: 'Texte' },
          ]}
        />
      </div>
      {notice && (
        <p className="footnote secondary" role="status" style={{ margin: '0 4px 10px' }}>
          {notice}
        </p>
      )}
      {mode === 'blocks' ? (
        <BlockEditor blocks={blocks} onChange={changeBlocks} />
      ) : (
        <>
          <div className="group">
            <textarea className="field" aria-label="Structure de la séance" value={description} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
          </div>
          <p className="section-footer">Une ligne par palier : « - 10m 95-100% », « - 15m ramp 50-75% ». « 3x » répète les paliers suivants jusqu’à la ligne vide.</p>
        </>
      )}
    </div>
  );
}

/** Profil, durée, Charge et Intensité d'une séance, recalculés à chaque modification. */
export function WorkoutSummary({ description }: { description: string }) {
  const steps = useMemo(() => parseWorkout(description), [description]);
  const stats = workoutStats(steps);
  return (
    <div className="card" style={{ background: 'var(--cell-2)' }}>
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
  );
}

/** Profil de la séance : largeur = durée, hauteur = intensité, couleur = zone. */
export function WorkoutProfile({ steps, height = 64 }: { steps: Step[]; height?: number }) {
  const total = steps.reduce((s, x) => s + x.seconds, 0) || 1;
  const max = Math.max(130, ...steps.map((s) => Math.max(s.from, s.to)));
  const H = height;
  let x = 0;
  return (
    <svg viewBox={`0 0 300 ${H}`} width="100%" height={H} role="img" aria-label="Profil de la séance" preserveAspectRatio="none">
      {steps.length === 0 && <line x1={0} y1={H - 1} x2={300} y2={H - 1} stroke="var(--separator)" />}
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
