import type { IntervalsWellness } from '../types.js';

/**
 * Courbe du poids (fonction pure) à partir de la forme du jour d'Intervals.icu,
 * où la fiche profil écrit chaque pesée (routes/profile.ts → updateWellness).
 */

export interface WeightPoint {
  /** AAAA-MM-JJ */
  date: string;
  kg: number;
}

/** Mêmes bornes que la saisie de la fiche profil : on écarte les valeurs aberrantes. */
const WEIGHT_MIN = 30;
const WEIGHT_MAX = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** Pesées triées par date, une par jour, arrondies à 0,1 kg. */
export function weightSeries(wellness: IntervalsWellness[]): WeightPoint[] {
  const byDay = new Map<string, number>();
  for (const w of wellness) {
    const kg = w.weight;
    if (typeof w.id !== 'string' || !DATE_RE.test(w.id)) continue;
    if (kg == null || !Number.isFinite(kg) || kg < WEIGHT_MIN || kg > WEIGHT_MAX) continue;
    byDay.set(w.id.slice(0, 10), Math.round(kg * 10) / 10);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, kg]) => ({ date, kg }));
}
