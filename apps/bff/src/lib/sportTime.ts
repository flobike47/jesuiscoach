import { sportOf } from './sport.js';
import type { IntervalsActivity } from '../types.js';

/**
 * Répartition des sports pratiqués (fonctions pures) : temps de déplacement
 * par sport — vélo, course, natation, autre (renforcement, randonnée…).
 */

export const SPORT_GROUPS = ['Ride', 'Run', 'Swim', 'Other'] as const;
export type SportGroup = (typeof SPORT_GROUPS)[number];
/** Secondes par sport. */
export type SportTime = Record<SportGroup, number>;

export const emptySportTime = (): SportTime => ({ Ride: 0, Run: 0, Swim: 0, Other: 0 });

/** Temps par sport des sorties commencées le jour `from` (AAAA-MM-JJ) ou après. */
export function timeBySport(activities: Array<Pick<IntervalsActivity, 'type' | 'moving_time' | 'start_date_local'>>, from: string): SportTime {
  const out = emptySportTime();
  for (const a of activities) {
    if (typeof a.start_date_local !== 'string' || a.start_date_local.slice(0, 10) < from) continue;
    const secs = a.moving_time;
    if (secs == null || !Number.isFinite(secs) || secs <= 0) continue;
    out[sportOf(a.type) ?? 'Other'] += Math.round(secs);
  }
  return out;
}

/** Temps total de l'équipe par sport (somme des temps de chacun). */
export function addSportTimes(list: SportTime[]): SportTime {
  const out = emptySportTime();
  for (const t of list) for (const k of SPORT_GROUPS) out[k] += t[k];
  return out;
}
