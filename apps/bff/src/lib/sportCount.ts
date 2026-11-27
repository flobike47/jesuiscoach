import { sportOf } from './sport.js';
import type { IntervalsActivity } from '../types.js';

/**
 * Répartition des sports pratiqués (fonctions pures) : nombre de sorties
 * par sport — vélo, course, natation, autre (renforcement, randonnée…).
 * Une sortie compte pour une, quelle que soit sa durée.
 */

export const SPORT_GROUPS = ['Ride', 'Run', 'Swim', 'Other'] as const;
export type SportGroup = (typeof SPORT_GROUPS)[number];
/** Nombre de sorties par sport. */
export type SportCount = Record<SportGroup, number>;

export const emptySportCount = (): SportCount => ({ Ride: 0, Run: 0, Swim: 0, Other: 0 });

/** Nombre de sorties par sport commencées le jour `from` (AAAA-MM-JJ) ou après. */
export function countBySport(activities: Array<Pick<IntervalsActivity, 'type' | 'start_date_local'>>, from: string): SportCount {
  const out = emptySportCount();
  for (const a of activities) {
    if (typeof a.start_date_local !== 'string' || a.start_date_local.slice(0, 10) < from) continue;
    out[sportOf(a.type) ?? 'Other'] += 1;
  }
  return out;
}

/** Nombre de sorties de l'équipe par sport (somme des sorties de chacun). */
export function addSportCounts(list: SportCount[]): SportCount {
  const out = emptySportCount();
  for (const t of list) for (const k of SPORT_GROUPS) out[k] += t[k];
  return out;
}
