import type { IntervalsActivity, IntervalsEvent } from '../types.js';

/**
 * Appariement séances prévues ↔ sorties faites.
 *
 * 1. Intervals.icu apparie lui-même une sortie à la séance du jour
 *    (`paired_event_id` sur la sortie) : c'est la source de vérité.
 * 2. Repli pour les sorties sans appariement (synchro ancienne, séance
 *    ajoutée après coup) : une sortie vélo non appariée le même jour.
 *
 * Une sortie ne réalise qu'une séance, une séance n'est réalisée qu'une fois.
 */

const isRide = (a: IntervalsActivity) => (a.type ?? '').includes('Ride');
const dayOf = (iso: string) => iso.slice(0, 10);

export interface PlanMatch {
  /** Séance (par identité d'objet) → sortie qui la réalise. */
  activityOf: Map<IntervalsEvent, IntervalsActivity>;
  /** Id de sortie → séance réalisée. */
  eventOfActivity: Map<string, IntervalsEvent>;
}

export function matchPlan(events: IntervalsEvent[], activities: IntervalsActivity[]): PlanMatch {
  const activityOf = new Map<IntervalsEvent, IntervalsActivity>();
  const eventOfActivity = new Map<string, IntervalsEvent>();
  const workouts = events
    .filter((e) => e.category === 'WORKOUT')
    .sort((x, y) => x.start_date_local.localeCompare(y.start_date_local));

  const pair = (e: IntervalsEvent, a: IntervalsActivity) => {
    activityOf.set(e, a);
    eventOfActivity.set(String(a.id), e);
  };

  for (const a of activities) {
    if (a.paired_event_id == null) continue;
    const e = workouts.find((w) => w.id != null && String(w.id) === String(a.paired_event_id));
    if (e && !activityOf.has(e)) pair(e, a);
  }

  // Repli : séances restantes, dans l'ordre du calendrier, avec une sortie
  // vélo du même jour qu'Intervals.icu n'a appariée à rien.
  for (const e of workouts) {
    if (activityOf.has(e)) continue;
    const a = activities.find(
      (x) => isRide(x) && x.paired_event_id == null && !eventOfActivity.has(String(x.id)) && dayOf(x.start_date_local) === dayOf(e.start_date_local),
    );
    if (a) pair(e, a);
  }

  return { activityOf, eventOfActivity };
}
