/**
 * Fitness du groupe (logique pure) : une petite courbe par athlète, toutes à
 * la même échelle pour pouvoir les comparer. Jamais de moyenne ni de somme
 * entre athlètes.
 */

export interface FitnessSample {
  /** AAAA-MM-JJ */
  date: string;
  fitness: number;
}

export interface AthleteFitness {
  id: string;
  name: string;
  series: FitnessSample[];
}

/** Échelle commune : de 0 au maximum du groupe, arrondi à la dizaine supérieure (au moins 10). */
export function sharedMax(athletes: AthleteFitness[]): number {
  let max = 0;
  for (const a of athletes) for (const p of a.series) if (Number.isFinite(p.fitness) && p.fitness > max) max = p.fitness;
  return Math.max(10, Math.ceil(max / 10) * 10);
}

export interface FitnessTrend {
  latest: FitnessSample;
  first: FitnessSample;
  /** Évolution sur la période, arrondie à l'unité. */
  change: number;
}

export function trendOf(series: FitnessSample[]): FitnessTrend | null {
  if (series.length === 0) return null;
  const first = series[0];
  const latest = series[series.length - 1];
  const change = Math.round(latest.fitness - first.fitness);
  return { first, latest, change: change === 0 ? 0 : change };
}

/** Valeur `daysBack` jours avant la dernière (ou la plus ancienne disponible). */
export function valueDaysBefore(series: FitnessSample[], daysBack: number): number | null {
  if (series.length === 0) return null;
  const i = Math.max(0, series.length - 1 - daysBack);
  return series[i].fitness;
}

/**
 * Tracé SVG (attribut `d`) d'une courbe dans une boîte `width × height`,
 * `max` en haut, 0 en bas. Points répartis régulièrement (série quotidienne).
 */
export function sparkPath(series: FitnessSample[], width: number, height: number, max: number): string {
  if (series.length === 0 || max <= 0) return '';
  const step = series.length > 1 ? width / (series.length - 1) : 0;
  const y = (v: number) => height - (Math.min(Math.max(v, 0), max) / max) * height;
  return series.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(p.fitness).toFixed(1)}`).join(' ');
}

/** Point de la série le plus proche d'une abscisse relative (0 → 1). */
export function sampleAt(series: FitnessSample[], ratio: number): { index: number; sample: FitnessSample } | null {
  if (series.length === 0) return null;
  const index = Math.round(Math.min(1, Math.max(0, ratio)) * (series.length - 1));
  return { index, sample: series[index] };
}

/** « +4 », « −3 », « = ». */
export function formatChange(change: number): string {
  if (change === 0) return '=';
  return change > 0 ? `+${change}` : `−${Math.abs(change)}`;
}
