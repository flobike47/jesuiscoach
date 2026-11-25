import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Repeat, Trash2, TrendingUp, Square } from 'lucide-react';
import { NumberStepper } from '@/components/common/NumberStepper';
import { Segmented } from '@/components/ios';
import { zoneColor, type Sport } from '@/lib/workout';
import {
  clamp,
  DISTANCE_PRESETS,
  DURATION_PRESETS,
  formatMeters,
  formatMinutes,
  formatSize,
  LIMITS,
  move,
  newBlock,
  PCT_RANGE,
  retarget,
  SPORT_TARGETS,
  type Block,
  type BlockTarget,
  type InnerBlock,
  type RepeatBlock,
} from '@/lib/workoutBlocks';

/**
 * Éditeur de séance par blocs : on ajoute des paliers, des rampes et des
 * répétitions, on règle durée (ou distance), cible et cadence au toucher
 * (sans clavier), on réordonne et on supprime. Un seul bloc ouvert à la fois.
 */
export function BlockEditor({ blocks, sport, onChange }: { blocks: Block[]; sport: Sport; onChange: (blocks: Block[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const update = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const add = (kind: 'step' | 'ramp' | 'repeat') => {
    const b = newBlock(kind, sport);
    onChange([...blocks, b]);
    setOpen(b.id);
  };

  return (
    <div>
      <div className="group">
        {blocks.length === 0 && (
          <div className="footnote secondary" style={{ padding: '14px 16px' }}>
            Ajoute un premier bloc ci-dessous.
          </div>
        )}
        {blocks.map((b, i) => (
          <BlockRow
            key={b.id}
            block={b}
            sport={sport}
            open={open === b.id}
            onToggle={() => setOpen(open === b.id ? null : b.id)}
            onChange={(nb) => update(i, nb)}
            onMove={(d) => onChange(move(blocks, i, d))}
            onDelete={() => onChange(blocks.filter((_, j) => j !== i))}
            first={i === 0}
            last={i === blocks.length - 1}
          />
        ))}
      </div>
      <AddBar onAdd={add} withRepeat />
    </div>
  );
}

function AddBar({ onAdd, withRepeat }: { onAdd: (kind: 'step' | 'ramp' | 'repeat') => void; withRepeat?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
      <AddButton icon={<Square size={15} aria-hidden />} label="Palier" onClick={() => onAdd('step')} />
      <AddButton icon={<TrendingUp size={15} aria-hidden />} label="Rampe" onClick={() => onAdd('ramp')} />
      {withRepeat && <AddButton icon={<Repeat size={15} aria-hidden />} label="Répétition" onClick={() => onAdd('repeat')} />}
    </div>
  );
}

function AddButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="button tinted pressable" style={{ minHeight: 36, padding: '0 14px', fontSize: 15, borderRadius: 18 }} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

/* ---------- Une ligne de bloc ---------- */

const TARGET_SHORT: Record<BlockTarget, string> = { power: '%', hr: '% FC', pace: '% allure' };

function pctText(b: InnerBlock): string {
  const v = b.kind === 'ramp' ? `${b.from} → ${b.to}` : b.high > b.low ? `${b.low}–${b.high}` : `${b.low}`;
  return `${v} ${TARGET_SHORT[b.target]}`;
}

function summary(b: Block | InnerBlock): string {
  if (b.kind === 'repeat') {
    const time = b.steps.reduce((s, x) => s + x.seconds, 0);
    const dist = b.steps.reduce((s, x) => s + x.meters, 0);
    const size = [dist ? formatMeters(dist) : '', time ? formatMinutes(time) : ''].filter(Boolean).join(' + ');
    return `${b.count} × ${size} (${b.steps.length} palier${b.steps.length > 1 ? 's' : ''})`;
  }
  const cad = b.cadence ? ` · ${b.cadence.high > b.cadence.low ? `${b.cadence.low}–${b.cadence.high}` : b.cadence.low} rpm` : '';
  return `${b.kind === 'ramp' ? 'Rampe ' : ''}${formatSize(b)} · ${pctText(b)}${cad}`;
}

function color(b: Block | InnerBlock): string {
  if (b.kind === 'repeat') {
    const top = b.steps.reduce<InnerBlock | null>((m, s) => (!m || peak(s) > peak(m) ? s : m), null);
    return top ? zoneColor(peak(top), top.target) : 'var(--label-3)';
  }
  return zoneColor(b.kind === 'ramp' ? (b.from + b.to) / 2 : (b.low + b.high) / 2, b.target);
}

const peak = (s: InnerBlock) => (s.kind === 'ramp' ? Math.max(s.from, s.to) : s.high);

interface RowProps<T> {
  block: T;
  sport: Sport;
  open: boolean;
  onToggle: () => void;
  onChange: (b: T) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  first: boolean;
  last: boolean;
  nested?: boolean;
}

function BlockRow({ block, sport, open, onToggle, onChange, onMove, onDelete, first, last, nested }: RowProps<Block>) {
  const label = block.kind === 'repeat' ? 'Répétition' : block.kind === 'ramp' ? 'Rampe' : 'Palier';
  return (
    <div style={{ borderTop: first ? 'none' : '0.5px solid var(--separator)', marginLeft: nested ? 16 : 0 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${label} : ${summary(block)}${block.title ? `, ${block.title}` : ''}`}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '8px 16px', textAlign: 'left' }}
      >
        <span aria-hidden style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, background: color(block) }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          {block.title && <span className="caption secondary" style={{ display: 'block' }}>{block.title}</span>}
          <span className="tabular-nums" style={{ fontSize: 16 }}>
            {summary(block)}
          </span>
        </span>
        <ChevronDown size={18} color="var(--label-3)" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease-out' }} />
      </button>

      {open && (
        <div style={{ padding: '0 16px 14px', display: 'grid', gap: 12 }}>
          {!nested && (
            <input
              className="field"
              aria-label="Titre du bloc (facultatif)"
              placeholder="Titre (facultatif) : Échauffement…"
              value={block.title ?? ''}
              maxLength={60}
              onChange={(e) => onChange({ ...block, title: e.target.value || undefined })}
              style={{ background: 'var(--fill)', borderRadius: 10, minHeight: 40 }}
            />
          )}
          {block.kind === 'repeat' ? (
            <RepeatControls block={block} sport={sport} onChange={(b) => onChange({ ...b, title: block.title })} />
          ) : (
            <InnerControls block={block} sport={sport} onChange={(b) => onChange({ ...b, title: block.title })} />
          )}
          <RowActions label={label} first={first} last={last} onMove={onMove} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
}

function RowActions({ label, first, last, onMove, onDelete }: { label: string; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <IconButton label={`Monter ce ${label.toLowerCase()}`} disabled={first} onClick={() => onMove(-1)}>
        <ChevronUp size={18} aria-hidden />
      </IconButton>
      <IconButton label={`Descendre ce ${label.toLowerCase()}`} disabled={last} onClick={() => onMove(1)}>
        <ChevronDown size={18} aria-hidden />
      </IconButton>
      <span style={{ flex: 1 }} />
      <button type="button" className="pressable" onClick={onDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--red)', minHeight: 36, padding: '0 6px' }}>
        <Trash2 size={16} aria-hidden />
        Supprimer
      </button>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="pressable"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{ width: 36, height: 36, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'var(--fill)', color: 'var(--tint)', opacity: disabled ? 0.35 : 1 }}
    >
      {children}
    </button>
  );
}

/* ---------- Réglages d'un palier ---------- */

const TARGET_LABELS: Record<BlockTarget, string> = { power: 'Puissance', hr: 'Cardio', pace: 'Allure' };

function InnerControls({ block, sport, onChange }: { block: InnerBlock; sport: Sport; onChange: (b: InnerBlock) => void }) {
  const range = PCT_RANGE[block.target];
  const fit = (v: number) => clamp(v, range.min, range.max);
  // On garde une intensité comparable (ex. 100 % FTP → 95 % FC seuil).
  const setTarget = (target: BlockTarget) => onChange(retarget(block, target));

  return (
    <>
      <SizePicker block={block} sport={sport} onChange={(size) => onChange({ ...block, ...size })} />

      {SPORT_TARGETS[sport].length > 1 && (
        <Segmented<BlockTarget>
          label="Cible"
          value={block.target}
          onChange={setTarget}
          options={SPORT_TARGETS[sport].map((t) => ({ value: t, label: TARGET_LABELS[t] }))}
        />
      )}

      {block.kind === 'ramp' ? (
        <>
          <PctSlider label="Début" value={block.from} target={block.target} onChange={(from) => onChange({ ...block, from })} />
          <PctSlider label="Fin" value={block.to} target={block.target} onChange={(to) => onChange({ ...block, to })} />
        </>
      ) : block.high > block.low ? (
        <>
          <PctSlider label="De" value={block.low} target={block.target} onChange={(low) => onChange({ ...block, low, high: Math.max(low + 1, block.high) })} />
          <PctSlider label="À" value={block.high} target={block.target} onChange={(high) => onChange({ ...block, high, low: Math.min(block.low, high - 1) })} />
        </>
      ) : (
        <PctSlider label="Intensité" value={block.low} target={block.target} onChange={(v) => onChange({ ...block, low: v, high: v })} />
      )}
      {block.kind === 'step' && (
        <TextButton onClick={() => onChange(block.high > block.low ? { ...block, high: block.low } : { ...block, high: fit(block.low + 5) })}>
          {block.high > block.low ? 'Une seule valeur' : 'Une plage (ex. 95–100 %)'}
        </TextButton>
      )}

      {sport === 'Ride' && <CadenceControl value={block.cadence} onChange={(cadence) => onChange({ ...block, cadence })} />}
    </>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" style={{ color: 'var(--tint)', justifySelf: 'start', minHeight: 32, fontSize: 15 }} onClick={onClick}>
      {children}
    </button>
  );
}

/** Cadence cible (vélo) : facultative, une valeur ou une plage. */
function CadenceControl({ value, onChange }: { value: InnerBlock['cadence']; onChange: (v: InnerBlock['cadence']) => void }) {
  if (!value) return <TextButton onClick={() => onChange({ low: 90, high: 90 })}>Ajouter une cadence</TextButton>;
  const range = value.high > value.low;
  const set = (low: number, high: number) => onChange({ low: clamp(low, LIMITS.minRpm, LIMITS.maxRpm), high: clamp(high, LIMITS.minRpm, LIMITS.maxRpm) });
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {range ? (
        <>
          <RpmSlider label="Cadence de" value={value.low} onChange={(low) => set(low, Math.max(low + 1, value.high))} />
          <RpmSlider label="à" value={value.high} onChange={(high) => set(Math.min(value.low, high - 1), high)} />
        </>
      ) : (
        <RpmSlider label="Cadence" value={value.low} onChange={(v) => set(v, v)} />
      )}
      <div style={{ display: 'flex', gap: 16 }}>
        <TextButton onClick={() => (range ? set(value.low, value.low) : set(value.low - 5, value.low + 5))}>{range ? 'Une seule valeur' : 'Une plage'}</TextButton>
        <TextButton onClick={() => onChange(undefined)}>Retirer la cadence</TextButton>
      </div>
    </div>
  );
}

function RpmSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', rowGap: 4 }}>
      <span className="secondary">{label}</span>
      <span className="tabular-nums" style={{ fontWeight: 600 }}>
        {value} rpm
      </span>
      <input
        type="range"
        min={40}
        max={130}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label}, en tours par minute`}
        style={{ gridColumn: '1 / -1', width: '100%', accentColor: 'var(--indigo)' }}
      />
    </label>
  );
}

/* ---------- Durée ou distance ---------- */

type SizeMode = 'time' | 'distance';

/**
 * Choix de la durée (ou de la distance en course et natation) : raccourcis
 * en un toucher, puis réglage fin avec les roues natives (heures, minutes,
 * secondes ; km et m) — les menus déroulants s'affichent en roue sur iPhone.
 */
function SizePicker({ block, sport, onChange }: { block: InnerBlock; sport: Sport; onChange: (size: { seconds: number; meters: number }) => void }) {
  const mode: SizeMode = block.meters ? 'distance' : 'time';
  const canDistance = sport !== 'Ride';
  const setMode = (m: SizeMode) => {
    if (m === mode) return;
    onChange(m === 'distance' ? { seconds: 0, meters: sport === 'Swim' ? 100 : 1000 } : { seconds: 5 * 60, meters: 0 });
  };
  const presets = mode === 'time' ? DURATION_PRESETS : DISTANCE_PRESETS[sport];

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {canDistance && (
        <Segmented<SizeMode>
          label="Durée ou distance"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'time', label: 'Durée' },
            { value: 'distance', label: 'Distance' },
          ]}
        />
      )}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }} role="group" aria-label={mode === 'time' ? 'Durées courantes' : 'Distances courantes'}>
        {presets.map((p) => {
          const active = mode === 'time' ? block.seconds === p : block.meters === p;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(mode === 'time' ? { seconds: p, meters: 0 } : { seconds: 0, meters: p })}
              className="pressable tabular-nums"
              style={{
                flex: '0 0 auto',
                minHeight: 32,
                padding: '0 12px',
                borderRadius: 16,
                fontSize: 14,
                background: active ? 'var(--tint)' : 'var(--fill)',
                color: active ? '#fff' : 'var(--label)',
              }}
            >
              {mode === 'time' ? formatMinutes(p) : formatMeters(p)}
            </button>
          );
        })}
      </div>
      {mode === 'time' ? (
        <TimeWheels seconds={block.seconds} onChange={(seconds) => onChange({ seconds, meters: 0 })} />
      ) : (
        <DistanceWheels meters={block.meters} sport={sport} onChange={(meters) => onChange({ seconds: 0, meters })} />
      )}
    </div>
  );
}

const numbers = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

function TimeWheels({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const set = (nh: number, nm: number, ns: number) => onChange(clamp(nh * 3600 + nm * 60 + ns, LIMITS.minSeconds, LIMITS.maxSeconds));
  const secs = numbers(0, 55, 5);
  if (!secs.includes(s)) secs.push(s);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="tabular-nums">
      <Wheel label="Heures" value={h} options={numbers(0, 6)} suffix="h" onChange={(v) => set(v, m, s)} />
      <Wheel label="Minutes" value={m} options={numbers(0, 59)} suffix="min" onChange={(v) => set(h, v, s)} />
      <Wheel label="Secondes" value={s} options={secs.sort((a, b) => a - b)} suffix="s" onChange={(v) => set(h, m, v)} />
    </div>
  );
}

function DistanceWheels({ meters, sport, onChange }: { meters: number; sport: Sport; onChange: (m: number) => void }) {
  const set = (v: number) => onChange(clamp(v, LIMITS.minMeters, LIMITS.maxMeters));
  if (sport === 'Swim') {
    const opts = numbers(25, 4000, 25);
    if (!opts.includes(meters)) opts.push(meters);
    return <Wheel label="Mètres" value={meters} options={opts.sort((a, b) => a - b)} suffix="m" onChange={set} />;
  }
  const km = Math.floor(meters / 1000);
  const m = meters % 1000;
  const ms = numbers(0, 950, 50);
  if (!ms.includes(m)) ms.push(m);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="tabular-nums">
      <Wheel label="Kilomètres" value={km} options={numbers(0, 42)} suffix="km" onChange={(v) => set(v * 1000 + m)} />
      <Wheel label="Mètres" value={m} options={ms.sort((a, b) => a - b)} suffix="m" onChange={(v) => set(km * 1000 + v)} />
    </div>
  );
}

/** Une « roue » : menu déroulant natif (roue sur iPhone), habillé en pastille. */
function Wheel({ label, value, options, suffix, onChange }: { label: string; value: number; options: number[]; suffix: string; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--fill)', borderRadius: 9, padding: '0 10px', minHeight: 36 }}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ appearance: 'none', background: 'transparent', border: 0, font: 'inherit', fontWeight: 600, color: 'var(--label)', fontSize: 16, padding: '6px 0', textAlign: 'right' }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span className="secondary" style={{ fontSize: 15 }}>
        {suffix}
      </span>
    </label>
  );
}

/* ---------- Répétitions ---------- */

function RepeatControls({ block, sport, onChange }: { block: RepeatBlock; sport: Sport; onChange: (b: RepeatBlock) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const steps = block.steps;
  const set = (next: InnerBlock[]) => onChange({ ...block, steps: next });
  return (
    <>
      <NumberStepper
        label="Répétitions"
        value={block.count}
        unit="×"
        min={LIMITS.minCount}
        max={LIMITS.maxCount}
        step={1}
        onChange={(count) => onChange({ ...block, count })}
      />
      <div style={{ background: 'var(--cell-2)', borderRadius: 10, overflow: 'hidden' }}>
        {steps.map((s, i) => (
          <BlockRow
            key={s.id}
            nested
            block={s}
            sport={sport}
            open={open === s.id}
            onToggle={() => setOpen(open === s.id ? null : s.id)}
            onChange={(nb) => set(steps.map((x, j) => (j === i ? (nb as InnerBlock) : x)))}
            onMove={(d) => set(move(steps, i, d))}
            onDelete={() => set(steps.filter((_, j) => j !== i))}
            first={i === 0}
            last={i === steps.length - 1}
          />
        ))}
      </div>
      <AddBar
        onAdd={(kind) => {
          const b = newBlock(kind, sport) as InnerBlock;
          set([...steps, b]);
          setOpen(b.id);
        }}
      />
    </>
  );
}

/** Curseur du % de la cible (pas de 1 %), dans la plage de la cible ; au-delà via le mode texte. */
function PctSlider({ label, value, target, onChange }: { label: string; value: number; target: BlockTarget; onChange: (v: number) => void }) {
  const { min, max: top, unit } = PCT_RANGE[target];
  const max = Math.max(top, value);
  const c = zoneColor(value, target);
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', rowGap: 4 }}>
      <span className="secondary">{label}</span>
      <span className="tabular-nums" style={{ fontWeight: 600 }}>
        {value} {unit}
      </span>
      <input
        type="range"
        min={Math.min(min, value)}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), LIMITS.minPct, LIMITS.maxPct))}
        aria-label={`${label}, en ${unit}`}
        style={{ gridColumn: '1 / -1', width: '100%', accentColor: c === 'var(--label-3)' ? 'var(--gray)' : c }}
      />
    </label>
  );
}
