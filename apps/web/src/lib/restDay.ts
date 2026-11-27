import type { AppEvent } from '@/services/calendarApi';
import type { TeamCalendarDay } from '@/types';

/**
 * Repos prescrit par le coach (pur, sans React). Chez Intervals.icu c'est une
 * NOTE ; dans l'app on le reconnaît par `kind === 'rest'`, jamais par son nom
 * (le coach peut l'appeler autrement, et la démo n'a pas de noms).
 */

/** Libellé d'un repos prescrit, distinct du « Repos habituel » des disponibilités. */
export const PRESCRIBED_REST_LABEL = 'Repos prescrit';
export const USUAL_REST_LABEL = 'Repos habituel';

export const isPrescribedRest = (e: Pick<AppEvent, 'kind'>): boolean => e.kind === 'rest';

/** Note ordinaire : catégorie NOTE, mais pas un repos prescrit. */
export const isPlainNote = (e: Pick<AppEvent, 'kind' | 'category'>): boolean => e.category === 'NOTE' && !isPrescribedRest(e);

/** Jours (AAAA-MM-JJ) qui portent un repos prescrit. */
export function prescribedRestDays(events: AppEvent[]): Set<string> {
  return new Set(events.filter(isPrescribedRest).map((e) => e.start_date_local.slice(0, 10)));
}

/** Repos du planning d'équipe mis sous la forme d'un événement, celle qu'attend la feuille de repos. */
export function teamRestAsEvent(rest: NonNullable<TeamCalendarDay['rest']>, date: string): AppEvent {
  return {
    id: rest.id,
    kind: 'rest',
    category: 'NOTE',
    name: rest.name,
    description: rest.description ?? undefined,
    start_date_local: `${date}T00:00:00`,
  };
}

/** Sous-titre d'un repos prescrit : sa consigne, ou son nom s'il n'est pas le nom par défaut. */
export function restDetail(e: Pick<AppEvent, 'name' | 'description'>): string | null {
  const description = e.description?.trim();
  if (description) return description;
  const name = e.name?.trim();
  return name && name !== 'Repos' ? name : null;
}
