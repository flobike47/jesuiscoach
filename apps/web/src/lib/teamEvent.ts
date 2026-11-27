import type { AppEvent } from '@/services/calendarApi';
import type { TeamCalendarDay } from '@/types';

export type TeamWorkout = TeamCalendarDay['workouts'][number];

/**
 * Une séance du planning d'équipe (/team/calendar) mise sous la forme d'un
 * événement du calendrier, celle qu'attend la feuille de modification. Le
 * planning ne renvoie pas la date dans la séance : elle vient de la case.
 */
export function teamWorkoutAsEvent(workout: TeamWorkout, date: string): AppEvent {
  return {
    id: workout.id,
    name: workout.name,
    description: workout.description ?? undefined,
    type: workout.sport ?? 'Ride',
    category: 'WORKOUT',
    start_date_local: `${date}T00:00:00`,
  };
}
