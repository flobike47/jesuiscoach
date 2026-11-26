/**
 * Calculs pour la vue « Aujourd'hui » du coach : statistiques de l'équipe du jour.
 */

import type { TeamDayAthlete } from '@/services/calendarApi';

export interface TodayCounts {
  toWatch: number;
  doneWorkouts: number;
  totalWorkouts: number;
  stillPlanned: number;
}

/**
 * Calcule les statistiques de l'équipe du jour à partir des mêmes données.
 * - `doneWorkouts` = athlètes avec statut 'done'
 * - `totalWorkouts` = total des séances prévues (workouts planifiés)
 * - `stillPlanned` = séances restantes (planned)
 */
export function todayCounts(athletes: TeamDayAthlete[]): TodayCounts {
  const toWatch = athletes.filter((a) => a.status === 'missed' || a.status === 'extra' || a.status === 'rest').length;
  const doneWorkouts = athletes.filter((a) => a.status === 'done').length;
  const totalWorkouts = athletes.reduce((s, a) => s + a.planned.length, 0);
  const stillPlanned = athletes.filter((a) => a.status === 'planned').length;

  return {
    toWatch,
    doneWorkouts,
    totalWorkouts,
    stillPlanned,
  };
}
