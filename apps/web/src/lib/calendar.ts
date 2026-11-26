import type { DayStatus, GoalMetric, RacePriority } from '@/services/calendarApi';

/** Helpers purs du calendrier (libellés, décompte, statuts). */

/** Jours entre deux dates AAAA-MM-JJ (positif si `day` est après `today`). */
export function daysBetween(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** « aujourd'hui », « demain », « dans 42 j », « passée ». */
export function countdownLabel(days: number): string {
  if (days < 0) return 'passée';
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  return `dans ${days} j`;
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  done: 'Fait',
  planned: 'Prévu',
  missed: 'Manqué',
  rest: 'Repos',
  extra: 'Hors plan',
};

/** Couleur de statut (jetons de styles.css). */
export const STATUS_COLOR: Record<DayStatus, string> = {
  done: 'var(--green)',
  planned: 'var(--tint)',
  missed: 'var(--red)',
  rest: 'var(--label-3)',
  extra: 'var(--purple)',
};

export const PRIORITY_LABEL: Record<RacePriority, string> = {
  A: 'Priorité A',
  B: 'Priorité B',
  C: 'Priorité C',
};

export const METRIC_LABEL: Record<GoalMetric, string> = {
  ftp: 'FTP',
  weight: 'Poids',
  run_threshold: 'Seuil course',
  swim_threshold: 'Seuil natation',
  vma: 'VMA',
  weekly_hours: 'Heures par semaine',
  other: 'Autre',
};

/** Unité affichée après une valeur cible. */
export const METRIC_UNIT: Record<GoalMetric, string> = {
  ftp: 'W',
  weight: 'kg',
  run_threshold: 'min/km',
  swim_threshold: '/100 m',
  vma: 'km/h',
  weekly_hours: 'h',
  other: '',
};

export function formatTarget(metric: GoalMetric | null, value: number | null): string {
  if (value == null) return '';
  const unit = metric ? METRIC_UNIT[metric] : '';
  return unit ? `${value} ${unit}` : String(value);
}

/** Distance d'une compétition : « 175 km », « 800 m ». */
export function formatRaceDistance(m: number | null): string {
  if (m == null) return '';
  return m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${m} m`;
}

/** Une ligne est « à renvoyer » : elle n'a pas pu être envoyée ou a disparu chez Intervals.icu. */
export const needsResync = (syncStatus?: string) => syncStatus === 'error';
