import dayjs from 'dayjs';
import type { AppEvent, EventInput } from '@/services/calendarApi';
import type { Activity } from '@/types';
import { parseWorkout, workoutStats, type Sport } from './workout';
import type { DayStatus, GoalMetric, RacePriority } from '@/services/calendarApi';

/** Helpers purs du calendrier (libellés, décompte, statuts). */

export interface MonthGridDay {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  isCurrentMonth: boolean;
}

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

/**
 * Grille du mois (5-6 semaines, lundi→dimanche). Jours hors mois marqués,
 * utile pour le calendrier mois de la phase D.
 */
export function monthGrid(dateIso: string): MonthGridDay[][] {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  // Premier jour du mois courant
  const monthStart = new Date(Date.UTC(year, month, 1));
  // Premier lundi à partir du premier jour du mois (peut être du mois précédent)
  const dayOfWeek = monthStart.getUTCDay(); // 0=dim, 1=lun, 6=sam
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // nb de jours avant lundi
  const firstMonday = new Date(monthStart);
  firstMonday.setUTCDate(firstMonday.getUTCDate() - daysToMonday);

  // Dernier jour du mois courant
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  // Dernier dimanche après le dernier jour du mois (peut être du mois suivant)
  const lastDayOfWeek = monthEnd.getUTCDay();
  const daysToNextSunday = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
  const lastSunday = new Date(monthEnd);
  lastSunday.setUTCDate(lastSunday.getUTCDate() + daysToNextSunday);

  const weeks: MonthGridDay[][] = [];
  const current = new Date(firstMonday);

  while (current <= lastSunday) {
    const week: MonthGridDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = current.toISOString().split('T')[0];
      const isCurrentMonth = current.getUTCMonth() === month;
      week.push({
        date: dateStr,
        dayOfMonth: current.getUTCDate(),
        isCurrentMonth,
      });
      current.setUTCDate(current.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

/**
 * Calcule la charge de la semaine : charge faite (activités) et charge prévue (séances WORKOUT).
 * Retourne { done, planned, plannedCount, doneCount }.
 */
/** Date locale (« 2026-11-29T10:00:00 ») comprise entre deux jours inclus (« 2026-11-23 » → « 2026-11-29 »). */
function inRange(local: string, from: string, to: string): boolean {
  const day = local.slice(0, 10);
  return day >= from && day <= to;
}

export function weekLoad(events: AppEvent[], activities: Activity[], from: string, to: string) {
  let plannedLoad = 0;
  let doneLoad = 0;

  // Charge faite (activités)
  for (const a of activities) {
    if (inRange(a.start_date_local, from, to)) {
      if (a.icu_training_load != null) {
        doneLoad += a.icu_training_load;
      }
    }
  }

  // Charge prévue (séances WORKOUT seulement)
  for (const e of events) {
    if (e.category !== 'WORKOUT' || !inRange(e.start_date_local, from, to)) continue;
    // Les séances peuvent avoir une description (structure), calculer leur charge
    if (e.description) {
      const steps = parseWorkout(e.description);
      const stats = workoutStats(steps);
      plannedLoad += stats.load;
    }
  }

  const plannedCount = events.filter((e) => e.category === 'WORKOUT' && inRange(e.start_date_local, from, to)).length;
  const doneCount = activities.filter((a) => inRange(a.start_date_local, from, to)).length;

  return { done: doneLoad, planned: plannedLoad, plannedCount, doneCount };
}

/**
 * Trouve le prochain jour libre à partir de `fromDay` (non inclus).
 * Un jour est libre s'il n'est pas dans `busyDays` et que `isUnavailable(day)` retourne false.
 * @param fromDay Date ISO (YYYY-MM-DD) à partir de laquelle chercher (ce jour ne sera pas renvoyé)
 * @param busyDays Set de dates ISO occupées par des séances
 * @param isUnavailable Fonction retournant true si le jour est indisponible (repos/exception)
 * @param maxDays Nombre maximum de jours à chercher (défaut 14)
 * @returns Date ISO du premier jour libre, ou null si aucun trouvé dans la limite
 */
export function nextFreeDay(
  fromDay: string,
  busyDays: Set<string>,
  isUnavailable: (day: string) => boolean,
  maxDays = 14,
): string | null {
  let current = dayjs(fromDay).add(1, 'day');
  for (let i = 0; i < maxDays; i++) {
    const day = current.format('YYYY-MM-DD');
    if (!busyDays.has(day) && !isUnavailable(day)) {
      return day;
    }
    current = current.add(1, 'day');
  }
  return null;
}

/**
 * Décale les séances WORKOUT d'une semaine (ou N jours).
 * @param events Tous les événements
 * @param days Nombre de jours à décaler (typiquement 7 pour la semaine suivante)
 * @returns Liste d'EventInput prêtes à créer (copy de chaque WORKOUT décalée)
 */
export function shiftWorkouts(events: AppEvent[], days: number): EventInput[] {
  return events
    .filter((e) => e.category === 'WORKOUT')
    .map((e) => {
      const newDate = dayjs(e.start_date_local.slice(0, 10)).add(days, 'day').format('YYYY-MM-DD');
      const sport = (e.type ?? 'Ride') as Sport;
      return {
        kind: 'workout',
        date: newDate,
        name: e.name ?? 'Séance',
        sport,
        description: e.description ?? '',
      };
    });
}
