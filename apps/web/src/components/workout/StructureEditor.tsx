import { useMemo, useState } from 'react';
import { Segmented } from '@/components/ios';
import { formatDuration } from '@/lib/format';
import { approxSeconds, parseWorkout, workoutStats, zoneColor, type Sport, type Step } from '@/lib/workout';
import { blocksToText, formatMeters, formatMinutes, isBlockEditable, textToBlocks, type Block } from '@/lib/workoutBlocks';
import { BlockEditor } from './BlockEditor';

type Mode = 'blocks' | 'text';

const NOT_EDITABLE = 'Cette séance utilise des options que l’éditeur par blocs ne gère pas (zones « Z2 », watts, % FC max, consignes…) : elle reste en mode texte.';

/**
 * Structure d'une séance : éditeur par blocs (par défaut) ou texte au format
 * Intervals.icu. Le texte reste la valeur échangée avec le parent. Changer de
 * sport : le parent adapte le texte (convertForSport) et recrée l'éditeur
 * (`key` = sport).
 */
export function StructureEditor({ description, sport, onChange }: { description: string; sport: Sport; onChange: (text: string) => void }) {
  const editable = isBlockEditable(description);
  const [mode, setMode] = useState<Mode>(editable ? 'blocks' : 'text');
  const [blocks, setBlocks] = useState<Block[]>(() => (editable ? textToBlocks(description) : []));
  const [notice, setNotice] = useState<string | null>(editable ? null : NOT_EDITABLE);

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    if (next === 'blocks') {
      if (!isBlockEditable(description)) {
        setNotice(NOT_EDITABLE.replace('Cette séance utilise', 'Le texte contient').replace('elle reste', 'il reste'));
        return;
      }
      setBlocks(textToBlocks(description));
    }
    setNotice(null);
    setMode(next);
  };

  const changeBlocks = (next: Block[]) => {
    setBlocks(next);
    onChange(blocksToText(next, sport));
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
        <BlockEditor blocks={blocks} sport={sport} onChange={changeBlocks} />
      ) : (
        <>
          <div className="group">
            <textarea className="field" aria-label="Structure de la séance" value={description} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
          </div>
          <p className="section-footer">
            Une ligne par palier : « - 10m 95-100% 90rpm », « - 15m ramp 50-75% », « - 20m 85% LTHR », « - 400mtr 105% Pace ». « 3x » répète les paliers
            suivants jusqu’à la ligne vide. « m » = minutes, « mtr » = mètres.
          </p>
        </>
      )}
    </div>
  );
}

/** Profil, durée (ou distance), Charge et Intensité d'une séance, recalculés à chaque modification. */
export function WorkoutSummary({ description, sport = 'Ride' }: { description: string; sport?: Sport }) {
  const steps = useMemo(() => parseWorkout(description), [description]);
  const stats = workoutStats(steps);
  return (
    <div className="card" style={{ background: 'var(--cell-2)' }}>
      <WorkoutProfile steps={steps} sport={sport} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 8 }} className="tabular-nums">
        {stats.complete ? (
          <>
            <Figure label="Durée" value={formatDuration(stats.seconds)} />
            <Figure label="Charge estimée" value={String(stats.load)} />
            <Figure label="Intensité" value={stats.intensity.toLocaleString('fr-FR')} />
          </>
        ) : (
          <>
            <Figure label="Distance" value={formatMeters(stats.meters)} />
            <Figure label="+ durée" value={stats.seconds ? formatMinutes(stats.seconds) : '–'} />
            <Figure label="Charge" value="à l’envoi" />
          </>
        )}
      </div>
      {!stats.complete && (
        <p className="caption secondary" style={{ margin: '8px 0 0' }}>
          Paliers en distance : la durée et la charge dépendent de l’allure de chaque athlète, Intervals.icu les calcule à l’envoi.
        </p>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="caption secondary">{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/** Profil de la séance : largeur = durée (estimée pour les distances), hauteur = intensité, couleur = zone. */
export function WorkoutProfile({ steps, sport = 'Ride', height = 64 }: { steps: Step[]; sport?: Sport; height?: number }) {
  const widths = steps.map((s) => approxSeconds(s, sport));
  const total = widths.reduce((s, w) => s + w, 0) || 1;
  const max = Math.max(130, ...steps.map((s) => Math.max(s.from, s.to)));
  const H = height;
  let x = 0;
  return (
    <svg viewBox={`0 0 300 ${H}`} width="100%" height={H} role="img" aria-label="Profil de la séance" preserveAspectRatio="none">
      {steps.length === 0 && <line x1={0} y1={H - 1} x2={300} y2={H - 1} stroke="var(--separator)" />}
      {steps.map((s, i) => {
        const w = (widths[i] / total) * 300;
        const y1 = H - (s.from / max) * H;
        const y2 = H - (s.to / max) * H;
        const d = `M${x},${H} L${x},${y1} L${x + w},${y2} L${x + w},${H} Z`;
        x += w;
        return <path key={i} d={d} fill={zoneColor((s.from + s.to) / 2, s.target)} stroke="var(--cell-2)" strokeWidth={0.6} />;
      })}
    </svg>
  );
}
