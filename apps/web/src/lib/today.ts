/**
 * Calculs pour la vue « Aujourd'hui » du coach : statistiques de l'équipe du jour.
 */

import type { TeamDayAthlete } from '@/services/calendarApi';

export interface TodayCounts {
  toWatch: number;
  doneWorkouts: number;
  totalWorkouts: number;
  stillPlanned: number;
  /** Athlètes qui ont roulé aujourd'hui, prévu ou non. */
  ridesToday: number;
}

/**
 * Calcule les statistiques de l'équipe du jour à partir des mêmes données.
 * - `doneWorkouts` = athlètes avec statut 'done'
 * - `totalWorkouts` = total des séances prévues (workouts planifiés)
 * - `stillPlanned` = séances restantes (planned)
 */
export function todayCounts(athletes: TeamDayAthlete[]): TodayCounts {
  const toWatch = athletes.filter((a) => a.status === 'missed').length;
  const workouts = athletes.flatMap((a) => a.planned.filter((e) => e.category === 'WORKOUT'));
  const doneWorkouts = athletes.filter((a) => a.status === 'done').length;
  const totalWorkouts = workouts.length;
  const stillPlanned = athletes.filter((a) => a.status === 'planned').length;

  return {
    ridesToday: athletes.filter((a) => a.done.length > 0).length,
    toWatch,
    doneWorkouts,
    totalWorkouts,
    stillPlanned,
  };
}
