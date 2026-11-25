/**
 * Saisie directe des sélecteurs − / + (components/common/NumberStepper.tsx).
 * Pur : sans DOM ni React.
 *
 *  - Nombres : « 245 », « 70,5 » (virgule ou point).
 *  - Durées et allures : « 4:35 » → 275 s, « 1:05:30 » → 3930 s, « 90 » → 90 s.
 */

export type InputKind = 'number' | 'clock';

/** Lit la saisie ; null si elle est vide ou illisible (on garde alors l'ancienne valeur). */
export function parseInput(text: string, kind: InputKind): number | null {
  const t = text.trim().replace(/\s+/g, '');
  if (!t) return null;
  if (kind === 'clock') {
    if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return null;
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return null;
  return Number(t.replace(',', '.'));
}

export interface Bounds {
  min: number;
  max: number;
  /** Pas des boutons ; la saisie est arrondie au même nombre de décimales. */
  step: number;
}

const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length;

/** Arrondit au nombre de décimales du pas et borne ; `clamped` = la saisie était hors limites. */
export function normalize(value: number, b: Bounds): { value: number; clamped: boolean } {
  const d = decimalsOf(b.step);
  const rounded = Math.round(value * 10 ** d) / 10 ** d;
  const bounded = Math.min(b.max, Math.max(b.min, rounded));
  return { value: bounded, clamped: bounded !== rounded };
}

/** Valeur suivante au bouton − / +, alignée sur le pas. */
export function stepValue(value: number | null, direction: 1 | -1, b: Bounds): number {
  const start = value ?? (direction > 0 ? b.min : b.max);
  return normalize(start + direction * b.step, b).value;
}

/** 275 → « 4:35 », 3930 → « 1:05:30 ». */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Valeur affichée dans le champ : « 70,5 », « 4:35 ». */
export function formatInput(value: number, kind: InputKind, step: number): string {
  if (kind === 'clock') return formatClock(value);
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimalsOf(step), useGrouping: false });
}
