import type { AppEvent } from '@/services/calendarApi';
import type { Activity } from '@/types';
import { parseWorkout, workoutStats, zoneColor } from './workout';

/** Marques visuelles pour un jour : barres des séances et statuts. */
export interface DayMarks {
  bars: Array<{ color: string; widthPct: number }>;
  done: boolean;
  race: boolean;
}

/**
 * Calcule les marques visuelles d'un jour :
 * - Une barre par séance WORKOUT
 * - Couleur = zone dominante (la plus longue) via zoneColor()
 * - Largeur ∝ durée : 3 h = 100 %, minimum 25 %
 * - done = séance du jour dans doneEventIds OU activité ce jour-là
 * - race = événement dont category commence par « RACE_ »
 * Comparaison : start_date_local.slice(0, 10)
 */
export function dayMarks(
  day: string, // YYYY-MM-DD
  events: AppEvent[],
  activities: Activity[],
  doneEventIds: string[],
): DayMarks {
  const bars: Array<{ color: string; widthPct: number }> = [];
  let done = false;
  let race = false;

  // Cherche les événements du jour
  const dayEvents = events.filter((e) => e.start_date_local?.slice(0, 10) === day);

  // Marque de course
  if (dayEvents.some((e) => e.category?.startsWith('RACE_'))) {
    race = true;
  }

  // Séances WORKOUT de ce jour
  const workouts = dayEvents.filter((e) => e.category === 'WORKOUT');
  for (const w of workouts) {
    if (!w.description) continue;
    const steps = parseWorkout(w.description);
    const stats = workoutStats(steps);

    // Durée : 3 h = 100 %, minimum 25 %
    const widthPct = Math.max(25, Math.min(100, (stats.seconds / (3 * 3600)) * 100));

    // Couleur : zone dominante (la plus longue)
    // Accumule la durée par zone pour trouver la zone la plus longue
    const byZone = new Map<string, number>();
    for (const step of steps) {
      if (!step.seconds) continue;
      const color = zoneColor(Math.round((step.from + step.to) / 2), step.target);
      byZone.set(color, (byZone.get(color) ?? 0) + step.seconds);
    }

    // Trouve la zone la plus longue, sinon utilise bleu par défaut
    let dominantColor = 'var(--blue)';
    let maxSeconds = 0;
    for (const [color, sec] of byZone) {
      if (sec > maxSeconds) {
        maxSeconds = sec;
        dominantColor = color;
      }
    }

    bars.push({ color: dominantColor, widthPct });
  }

  // Marque « fait »
  // Si une séance du jour est dans doneEventIds
  if (workouts.some((w) => doneEventIds.includes(String(w.id)))) {
    done = true;
  }
  // Ou s'il y a une activité ce jour-là
  if (activities.some((a) => a.start_date_local?.slice(0, 10) === day)) {
    done = true;
  }

  return { bars, done, race };
}

/**
 * Somme des charges prévues (séances WORKOUT) pour une semaine.
 */
export function weekPlannedLoad(
  weekDays: Array<{ date: string }>, // Array de jours avec date YYYY-MM-DD
  events: AppEvent[],
): number {
  let total = 0;
  for (const day of weekDays) {
    const dayEvents = events.filter((e) => e.category === 'WORKOUT' && e.start_date_local?.slice(0, 10) === day.date);
    for (const e of dayEvents) {
      if (!e.description) continue;
      const steps = parseWorkout(e.description);
      const stats = workoutStats(steps);
      total += stats.load;
    }
  }
  return total;
}
