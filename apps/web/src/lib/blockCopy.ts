import type { PlanWorkout, Sport } from '@/types';
import { addDays, daysBetween } from '@/lib/batchSend';

/**
 * Duplication d'un bloc d'entraînement : les séances prévues de plusieurs
 * semaines consécutives d'un athlète, recopiées à partir d'un autre lundi
 * (même athlète ou d'autres). Chaque séance garde son jour de la semaine.
 */

/** Un bloc se lit en une seule requête de calendrier, limitée à 62 jours par le BFF : 8 semaines au plus. */
export const BLOCK_MAX_WEEKS = 8;

/** Ce qu'il faut d'un événement du calendrier pour le recopier. */
export interface BlockEvent {
  category?: string | null;
  start_date_local: string;
  name?: string | null;
  description?: string | null;
  type?: string | null;
}

export interface BlockCopy {
  /** Séances placées en jours depuis le lundi de départ (jour 0). */
  workouts: PlanWorkout[];
  /** Séances sans structure (texte vide), qu'Intervals.icu ne peut pas recevoir telles quelles. */
  skipped: number;
}

const sportOf = (type: string | null | undefined): Sport => (type === 'Run' || type === 'Swim' ? type : 'Ride');

/** Dernier jour (inclus) d'un bloc de `weeks` semaines commençant le lundi `monday`. */
export const blockEnd = (monday: string, weeks: number) => addDays(monday, weeks * 7 - 1);

/**
 * Séances prévues du bloc de `weeks` semaines qui commence le lundi `monday`,
 * en jours depuis ce lundi. Compétitions et notes ne sont pas recopiées.
 */
export function blockWorkouts(events: BlockEvent[], monday: string, weeks: number): BlockCopy {
  const end = blockEnd(monday, weeks);
  const inBlock = events.filter((e) => {
    const day = e.start_date_local.slice(0, 10);
    return e.category === 'WORKOUT' && day >= monday && day <= end;
  });
  const workouts = inBlock
    .filter((e) => (e.description ?? '').trim().length > 0)
    .map((e) => ({
      day: daysBetween(monday, e.start_date_local),
      name: (e.name ?? '').trim() || 'Séance',
      description: e.description!.trim(),
      sport: sportOf(e.type),
    }))
    .sort((a, b) => a.day - b.day);
  return { workouts, skipped: inBlock.length - workouts.length };
}

/** Vrai si le bloc recopié à partir de `target` recouvre le bloc d'origine (même athlète : séances en double). */
export function overlapsSource(source: string, target: string, weeks: number): boolean {
  return Math.abs(daysBetween(source, target)) < weeks * 7;
}
