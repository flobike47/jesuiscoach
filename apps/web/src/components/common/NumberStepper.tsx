import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatInput, normalize, parseInput, stepValue, type InputKind } from '@/lib/numberInput';

/**
 * Sélecteur − / + avec saisie directe : les boutons pour ajuster, et un
 * toucher sur la valeur pour la taper au clavier numérique (valeur
 * présélectionnée, remplacée en une frappe). Une saisie hors limites est
 * ramenée à la borne avec un court message ; vide ou illisible, l'ancienne
 * valeur revient. Valider : « OK » du clavier, Entrée, ou toucher ailleurs.
 */
export interface NumberStepperProps {
  label: string;
  /** null = pas encore renseigné (affiche « – »). */
  value: number | null;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Pas des boutons (1, 0,1, 5…). */
  step: number;
  /** Unité affichée après la valeur : « W », « bpm », « kg », « /km »… */
  unit?: string;
  /** « clock » : saisie en minutes:secondes (allures, durées). */
  kind?: InputKind;
  /** Affichage de la valeur hors saisie (sinon le format de saisie). */
  format?: (value: number) => string;
  disabled?: boolean;
}

export function NumberStepper({ label, value, onChange, min, max, step, unit, kind = 'number', format, disabled }: NumberStepperProps) {
  const bounds = { min, max, step };
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const show = (v: number) => (format ? format(v) : formatInput(v, kind, step));
  const bound = (v: number) => (kind === 'clock' ? formatInput(v, 'clock', step) : formatInput(v, 'number', step));

  const startEdit = () => {
    if (disabled) return;
    setText(value == null ? '' : formatInput(value, kind, step));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const parsed = parseInput(text, kind);
    if (parsed == null) return;
    const { value: next, clamped } = normalize(parsed, bounds);
    if (clamped) setNotice(`${label} entre ${bound(min)} et ${bound(max)}${unit ? ` ${unit}` : ''}`);
    if (next !== value) onChange(next);
  };

  const press = (direction: 1 | -1) => {
    if (disabled) return;
    onChange(stepValue(value, direction, bounds));
  };

  return (
    <div style={{ display: 'grid', gap: 2, flex: 1, width: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
        <span style={{ flex: 1 }}>{label}</span>
        {editing ? (
          <input
            ref={input}
            className="tabular-nums"
            aria-label={`${label}${unit ? ` (${unit})` : ''}`}
            inputMode={kind === 'clock' ? 'numeric' : step < 1 ? 'decimal' : 'numeric'}
            enterKeyHint="done"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setText(value == null ? '' : formatInput(value, kind, step));
                setEditing(false);
              }
            }}
            placeholder={kind === 'clock' ? 'm:ss' : undefined}
            style={{ width: 96, textAlign: 'right', fontWeight: 600, fontSize: 16, background: 'var(--fill)', border: 0, borderRadius: 8, padding: '6px 8px', color: 'var(--label)' }}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            disabled={disabled}
            aria-label={`${label} : ${value == null ? 'non renseigné' : `${show(value)}${unit ? ` ${unit}` : ''}`}. Toucher pour saisir`}
            className="tabular-nums"
            style={{ fontWeight: 600, minHeight: 36, padding: '0 4px', color: 'var(--label)', textAlign: 'right' }}
          >
            {value == null ? '–' : show(value)}
            {unit && value != null && <span className="secondary" style={{ fontWeight: 400 }}>{` ${unit}`}</span>}
          </button>
        )}
        <div style={{ display: 'flex', background: 'var(--fill)', borderRadius: 9, overflow: 'hidden', opacity: disabled ? 0.4 : 1 }}>
          <button type="button" aria-label={`${label} : moins`} disabled={disabled || (value != null && value <= min)} onClick={() => press(-1)} style={{ width: 44, height: 34, display: 'grid', placeItems: 'center' }}>
            <Minus size={18} aria-hidden />
          </button>
          <span aria-hidden style={{ width: 0.5, background: 'var(--separator)', margin: '7px 0' }} />
          <button type="button" aria-label={`${label} : plus`} disabled={disabled || (value != null && value >= max)} onClick={() => press(1)} style={{ width: 44, height: 34, display: 'grid', placeItems: 'center' }}>
            <Plus size={18} aria-hidden />
          </button>
        </div>
      </div>
      {notice && (
        <span role="status" className="caption" style={{ color: 'var(--orange)', textAlign: 'right' }}>
          {notice}
        </span>
      )}
    </div>
  );
}
