import { BadRequest } from '../validation.js';

/**
 * Sports des séances : vélo, course à pied, natation. Les variantes
 * d'Intervals.icu (VirtualRide, TrailRun, OpenWaterSwim…) se ramènent à ces trois.
 */
export const SPORTS = ['Ride', 'Run', 'Swim'] as const;
export type Sport = (typeof SPORTS)[number];

/** Type Intervals.icu → sport de l'app ; null pour les autres activités. */
export function sportOf(type: string | null | undefined): Sport | null {
  const t = type ?? '';
  if (t.includes('Ride') || t === 'Cyclocross') return 'Ride';
  if (t.includes('Run')) return 'Run';
  if (t.includes('Swim')) return 'Swim';
  return null;
}

/** Sport d'une requête : absent = vélo (compatibilité), sinon l'une des trois valeurs. */
export function validateSport(input: unknown): Sport {
  if (input == null) return 'Ride';
  if (typeof input === 'string' && (SPORTS as readonly string[]).includes(input)) return input as Sport;
  throw new BadRequest('sport invalide (Ride, Run ou Swim)');
}
