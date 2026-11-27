import type { PlanWorkout, Sport } from '@/types';
import { addDays, SEND_LIMITS, weekdayOf } from '@/lib/batchSend';

/**
 * Séance récurrente (« la sortie club tous les mardis pendant 8 semaines ») :
 * des séances indépendantes, créées d'un coup. Aucune série n'est gardée :
 * modifier ou supprimer une occurrence ne touche pas les autres.
 */

/** 12 semaines au plus : au-delà, le plan se prépare plutôt bloc par bloc (et le quota de l'athlète suit). */
export const RECURRENCE_MAX_WEEKS = SEND_LIMITS.maxWeeks;

export const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

/**
 * Jours des occurrences, en jours depuis `start` : chaque jour de la période
 * de `weeks` semaines qui commence à `start` et tombe sur un des `weekdays`
 * (0 = lundi … 6 = dimanche).
 */
export function recurrenceDays(start: string, weekdays: number[], weeks: number): number[] {
  const span = Math.max(0, Math.min(RECURRENCE_MAX_WEEKS, Math.floor(weeks))) * 7;
  const wanted = new Set(weekdays);
  const first = weekdayOf(start);
  return Array.from({ length: span }, (_, day) => day).filter((day) => wanted.has((first + day) % 7));
}

/** Séances à envoyer, prêtes pour `POST /plans/apply` (jour 0 = `start`). */
export function recurrenceWorkouts(
  workout: { name: string; description: string; sport?: Sport },
  start: string,
  weekdays: number[],
  weeks: number,
): PlanWorkout[] {
  return recurrenceDays(start, weekdays, weeks).map((day) => ({ day, name: workout.name, description: workout.description, sport: workout.sport ?? 'Ride' }));
}

/** Dates de la première et de la dernière occurrence (null sans occurrence). */
export function recurrenceRange(start: string, days: number[]): { first: string; last: string } | null {
  if (days.length === 0) return null;
  return { first: addDays(start, days[0]), last: addDays(start, days[days.length - 1]) };
}
