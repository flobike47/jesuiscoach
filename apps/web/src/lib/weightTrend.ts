/**
 * Courbe du poids (logique pure) : période affichée, évolution, échelle.
 */

export interface WeightPoint {
  /** AAAA-MM-JJ */
  date: string;
  kg: number;
}

export type WeightRange = '90' | '365';

const DAY = 24 * 60 * 60 * 1000;

/** Pesées des `days` derniers jours jusqu'à `today` (inclus). */
export function inRange(points: WeightPoint[], range: WeightRange, today: string): WeightPoint[] {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - Number(range) * DAY).toISOString().slice(0, 10);
  return points.filter((p) => p.date >= from && p.date <= today);
}

export interface WeightSummary {
  latest: WeightPoint;
  /** Évolution depuis la première pesée de la période (kg, arrondie à 0,1) ; null avec une seule pesée. */
  change: number | null;
  first: WeightPoint;
}

export function summarizeWeight(points: WeightPoint[]): WeightSummary | null {
  if (points.length === 0) return null;
  const first = points[0];
  const latest = points[points.length - 1];
  const change = points.length > 1 ? Math.round((latest.kg - first.kg) * 10) / 10 : null;
  return { latest, first, change: change === 0 ? 0 : change };
}

/**
 * Échelle verticale : au moins 4 kg d'amplitude, arrondie au kilo, pour
 * qu'une variation de 300 g ne ressemble pas à une chute.
 */
export function weightDomain(points: WeightPoint[]): [number, number] {
  if (points.length === 0) return [60, 80];
  const min = Math.min(...points.map((p) => p.kg));
  const max = Math.max(...points.map((p) => p.kg));
  const pad = Math.max(0, (4 - (max - min)) / 2);
  return [Math.floor(min - pad - 0.5), Math.ceil(max + pad + 0.5)];
}

/** « −1,2 kg », « +0,4 kg », « stable ». */
export function formatChange(change: number | null): string {
  if (change == null) return '';
  if (Math.abs(change) < 0.05) return 'stable';
  const abs = Math.abs(change).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${change > 0 ? '+' : '−'}${abs} kg`;
}

export const formatKg = (kg: number): string => `${kg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
