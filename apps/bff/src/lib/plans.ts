import { BadRequest, validateString } from '../validation.js';

/**
 * Plans d'entraînement : une suite de séances placées par décalage en jours
 * (jour 0 = date de départ choisie à l'application du plan).
 */

export interface PlanWorkout {
  /** 0 = premier jour du plan. */
  day: number;
  name: string;
  description: string;
}

/**
 * Bornes : chaque séance d'un plan est une écriture Intervals.icu par athlète,
 * prise sur son quota de 100 requêtes/jour. 40 séances sur 12 semaines au
 * plus ; 120 écritures au plus par application (ex. 30 séances × 4 athlètes).
 */
export const PLAN_LIMITS = { maxWorkouts: 40, maxDay: 83, maxPlansPerCoach: 30, maxWritesPerApply: 120 } as const;

/** Valide et trie les séances d'un plan (400 sinon). */
export function validatePlanWorkouts(input: unknown): PlanWorkout[] {
  if (!Array.isArray(input) || input.length === 0) throw new BadRequest('Le plan doit contenir au moins une séance');
  if (input.length > PLAN_LIMITS.maxWorkouts) throw new BadRequest(`${PLAN_LIMITS.maxWorkouts} séances au plus par plan`);
  return input
    .map((w: unknown, i) => {
      const { day, name, description } = (w ?? {}) as Record<string, unknown>;
      if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > PLAN_LIMITS.maxDay) {
        throw new BadRequest(`Séance ${i + 1} : jour invalide (0 à ${PLAN_LIMITS.maxDay})`);
      }
      if (typeof name !== 'string' || typeof description !== 'string') throw new BadRequest(`Séance ${i + 1} : nom et structure requis`);
      return { day, name: validateString(name, 'name', 120), description: validateString(description, 'description', 4000) };
    })
    .sort((a, b) => a.day - b.day);
}

/** Dates des séances à partir du jour de départ (AAAA-MM-JJ, calcul en UTC : pas de décalage d'heure d'été). */
export function planDates(startDate: string, workouts: PlanWorkout[]): Array<PlanWorkout & { date: string }> {
  const start = Date.parse(`${startDate}T12:00:00Z`);
  return workouts.map((w) => ({ ...w, date: new Date(start + w.day * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }));
}
