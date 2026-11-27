/**
 * Envoi groupé de séances (bloc dupliqué, séance récurrente) : bornes et
 * calcul de dates partagés. L'envoi passe par `POST /plans/apply` du BFF, qui
 * applique les mêmes bornes que les plans d'entraînement.
 */

/**
 * Bornes alignées sur le BFF (lib/plans.ts, PLAN_LIMITS). Chaque séance est une
 * écriture Intervals.icu sur le quota de l'athlète (100 requêtes/jour) :
 * 40 séances sur 12 semaines au plus, 120 écritures au plus par envoi.
 */
export const SEND_LIMITS = { maxWorkouts: 40, maxWeeks: 12, maxWrites: 120 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const noon = (day: string) => Date.parse(`${day.slice(0, 10)}T12:00:00Z`);

/** Nombre de jours de `from` à `to` (AAAA-MM-JJ). Calcul à midi UTC : l'heure d'été ne décale rien. */
export function daysBetween(from: string, to: string): number {
  return Math.round((noon(to) - noon(from)) / DAY_MS);
}

/** `day` + `n` jours (AAAA-MM-JJ). */
export function addDays(day: string, n: number): string {
  return new Date(noon(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Jour de la semaine, 0 = lundi … 6 = dimanche. */
export function weekdayOf(day: string): number {
  return (new Date(noon(day)).getUTCDay() + 6) % 7;
}

/** Lundi de la semaine de `day`. */
export function mondayOf(day: string): string {
  return addDays(day, -weekdayOf(day));
}

/** Ce qui bloque un envoi de `workouts` séances à `athletes` athlètes (null si tout tient). */
export function sendProblem(workouts: number, athletes: number): string | null {
  if (workouts === 0) return 'Aucune séance à envoyer.';
  if (athletes === 0) return 'Choisis au moins un athlète.';
  if (workouts > SEND_LIMITS.maxWorkouts) return `${workouts} séances : ${SEND_LIMITS.maxWorkouts} au plus par envoi.`;
  if (workouts * athletes > SEND_LIMITS.maxWrites) {
    return `${workouts * athletes} séances à créer : ${SEND_LIMITS.maxWrites} au plus par envoi. Choisis moins d’athlètes ou moins de semaines.`;
  }
  return null;
}

/** Résumé du résultat d'un envoi (`ApplyPlanResult`), athlète par athlète. */
export function sendReport(
  total: number,
  results: Array<{ id: string; ok: boolean; created: number; error?: string }>,
  nameOf: (id: string) => string,
): { ok: boolean; text: string } {
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    const n = total * results.length;
    return { ok: true, text: `${n} séance${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}.` };
  }
  const details = failed.map((r) => `${nameOf(r.id)} : ${r.created}/${total} créées (${r.error ?? 'erreur inconnue'})`);
  return { ok: false, text: `Envoi incomplet. ${details.join(' · ')}` };
}
