import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus, Repeat, Trash2, TrendingUp, Square } from 'lucide-react';
import { zoneColor } from '@/lib/workout';
import { clamp, durationStep, formatMinutes, LIMITS, move, newBlock, type Block, type InnerBlock, type RepeatBlock } from '@/lib/workoutBlocks';

/**
 * Éditeur de séance par blocs : on ajoute des paliers, des rampes et des
 * répétitions, on règle durée et % FTP au toucher (sans clavier), on
 * réordonne et on supprime. Un seul bloc ouvert à la fois.
 */
export function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (blocks: Block[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const update = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const add = (kind: 'step' | 'ramp' | 'repeat') => {
    const b = newBlock(kind);
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

function summary(b: Block | InnerBlock): string {
  const d = formatMinutes(b.kind === 'repeat' ? 0 : b.seconds);
  if (b.kind === 'ramp') return `Rampe ${d} · ${b.from} → ${b.to} %`;
  if (b.kind === 'step') return `${d} · ${b.high > b.low ? `${b.low}–${b.high}` : b.low} %`;
  const inner = b.steps.reduce((s, x) => s + x.seconds, 0);
  return `${b.count} × ${formatMinutes(inner)} (${b.steps.length} palier${b.steps.length > 1 ? 's' : ''})`;
}

function color(b: Block | InnerBlock): string {
  if (b.kind === 'repeat') return zoneColor(Math.max(...b.steps.map((s) => (s.kind === 'ramp' ? Math.max(s.from, s.to) : s.high)), 0));
  return zoneColor(b.kind === 'ramp' ? (b.from + b.to) / 2 : (b.low + b.high) / 2);
}

interface RowProps<T> {
  block: T;
  open: boolean;
  onToggle: () => void;
  onChange: (b: T) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  first: boolean;
  last: boolean;
  nested?: boolean;
}

function BlockRow({ block, open, onToggle, onChange, onMove, onDelete, first, last, nested }: RowProps<Block>) {
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
        <div style={{ padding: '0 16px 12px', display: 'grid', gap: 10 }}>
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
            <RepeatControls block={block} onChange={(b) => onChange({ ...b, title: block.title })} />
          ) : (
            <InnerControls block={block} onChange={(b) => onChange({ ...b, title: block.title })} />
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

/* ---------- Réglages ---------- */

function InnerControls({ block, onChange }: { block: InnerBlock; onChange: (b: InnerBlock) => void }) {
  const duration = (
    <Stepper
      label="Durée"
      value={formatMinutes(block.seconds)}
      onMinus={() => onChange({ ...block, seconds: durationStep(block.seconds, -1) })}
      onPlus={() => onChange({ ...block, seconds: durationStep(block.seconds, 1) })}
      minusDisabled={block.seconds <= LIMITS.minSeconds}
      plusDisabled={block.seconds >= LIMITS.maxSeconds}
    />
  );
  if (block.kind === 'ramp') {
    return (
      <>
        {duration}
        <PctSlider label="Début" value={block.from} onChange={(from) => onChange({ ...block, from })} />
        <PctSlider label="Fin" value={block.to} onChange={(to) => onChange({ ...block, to })} />
      </>
    );
  }
  const range = block.high > block.low;
  return (
    <>
      {duration}
      {range ? (
        <>
          <PctSlider label="De" value={block.low} onChange={(low) => onChange({ ...block, low, high: Math.max(low + 1, block.high) })} />
          <PctSlider label="À" value={block.high} onChange={(high) => onChange({ ...block, high, low: Math.min(block.low, high - 1) })} />
        </>
      ) : (
        <PctSlider label="Intensité" value={block.low} onChange={(v) => onChange({ ...block, low: v, high: v })} />
      )}
      <button
        type="button"
        style={{ color: 'var(--tint)', justifySelf: 'start', minHeight: 32, fontSize: 15 }}
        onClick={() => onChange(range ? { ...block, high: block.low } : { ...block, high: clamp(block.low + 5, LIMITS.minPct, LIMITS.maxPct) })}
      >
        {range ? 'Une seule valeur' : 'Une plage (ex. 95–100 %)'}
      </button>
    </>
  );
}

function RepeatControls({ block, onChange }: { block: RepeatBlock; onChange: (b: RepeatBlock) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const steps = block.steps;
  const set = (next: InnerBlock[]) => onChange({ ...block, steps: next });
  return (
    <>
      <Stepper
        label="Répétitions"
        value={`${block.count} ×`}
        onMinus={() => onChange({ ...block, count: clamp(block.count - 1, LIMITS.minCount, LIMITS.maxCount) })}
        onPlus={() => onChange({ ...block, count: clamp(block.count + 1, LIMITS.minCount, LIMITS.maxCount) })}
        minusDisabled={block.count <= LIMITS.minCount}
        plusDisabled={block.count >= LIMITS.maxCount}
      />
      <div style={{ background: 'var(--cell-2)', borderRadius: 10, overflow: 'hidden' }}>
        {steps.map((s, i) => (
          <BlockRow
            key={s.id}
            nested
            block={s}
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
          const b = newBlock(kind) as InnerBlock;
          set([...steps, b]);
          setOpen(b.id);
        }}
      />
    </>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="secondary" style={{ flex: 1 }}>
        {label}
      </span>
      <span className="tabular-nums" style={{ fontWeight: 600, minWidth: 84, textAlign: 'right' }} aria-live="polite">
        {value}
      </span>
      <div style={{ display: 'flex', background: 'var(--fill)', borderRadius: 9, overflow: 'hidden' }}>
        <button type="button" aria-label={`${label} : moins`} disabled={minusDisabled} onClick={onMinus} style={{ width: 46, height: 34, display: 'grid', placeItems: 'center', opacity: minusDisabled ? 0.35 : 1 }}>
          <Minus size={18} aria-hidden />
        </button>
        <span aria-hidden style={{ width: 0.5, background: 'var(--separator)', margin: '7px 0' }} />
        <button type="button" aria-label={`${label} : plus`} disabled={plusDisabled} onClick={onPlus} style={{ width: 46, height: 34, display: 'grid', placeItems: 'center', opacity: plusDisabled ? 0.35 : 1 }}>
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Curseur de % FTP (pas de 1 %), de 40 à 200 % ; au-delà via le mode texte. */
function PctSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const max = Math.max(200, value);
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', rowGap: 4 }}>
      <span className="secondary">{label}</span>
      <span className="tabular-nums" style={{ fontWeight: 600 }}>
        {value} % FTP
      </span>
      <input
        type="range"
        min={40}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), LIMITS.minPct, LIMITS.maxPct))}
        aria-label={`${label}, en % de la FTP`}
        style={{ gridColumn: '1 / -1', width: '100%', accentColor: zoneColor(value) === 'var(--label-3)' ? 'var(--gray)' : zoneColor(value) }}
      />
    </label>
  );
}
