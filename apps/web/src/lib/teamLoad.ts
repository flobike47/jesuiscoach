import type { TeamCalendarAthlete } from '@/types';

/**
 * Charge prévue / faite par athlète sur la période du planning d'équipe, pour
 * repérer qui suit le plan. Chaque athlète est lu seul : on n'additionne
 * jamais la charge (ni la forme, ni la fatigue) de plusieurs athlètes.
 *
 * En cours de semaine, la charge faite se compare à la charge prévue « à ce
 * jour » (séances des jours passés, et celles du jour déjà faites), pas à
 * toute la semaine : sinon tout le monde paraîtrait en retard le mercredi.
 */

export type LoadStatus = 'retard' | 'au-dessus' | 'suit' | 'hors-plan' | 'a-venir' | 'rien' | 'indisponible';

export interface AthleteLoad {
  id: string;
  name: string;
  /** Charge prévue sur toute la période. */
  planned: number;
  /** Charge prévue des jours déjà passés (et des séances du jour déjà faites). */
  plannedToDate: number;
  /** Charge des sorties faites. */
  done: number;
  /** Charge habituelle ramenée à la période (null si inconnue). */
  usual: number | null;
  status: LoadStatus;
}

/** Écart toléré autour de la charge prévue à ce jour : ±20 %. */
export const LOAD_TOLERANCE = 0.2;

export const STATUS_LABELS: Record<LoadStatus, string> = {
  retard: 'En retard sur le plan',
  'au-dessus': 'Au-dessus du plan',
  suit: 'Suit le plan',
  'hors-plan': 'Roule hors plan',
  'a-venir': 'Rien de dû à ce jour',
  rien: 'Rien de prévu',
  indisponible: 'Données indisponibles',
};

const ORDER: LoadStatus[] = ['retard', 'au-dessus', 'suit', 'hors-plan', 'a-venir', 'rien', 'indisponible'];

function statusOf(plannedToDate: number, done: number, planned: number): LoadStatus {
  if (plannedToDate > 0) {
    const ratio = done / plannedToDate;
    if (ratio < 1 - LOAD_TOLERANCE) return 'retard';
    if (ratio > 1 + LOAD_TOLERANCE) return 'au-dessus';
    return 'suit';
  }
  if (done > 0) return 'hors-plan';
  return planned > 0 ? 'a-venir' : 'rien';
}

/** Une ligne par athlète, les plus en retard d'abord. */
export function athleteLoads(athletes: TeamCalendarAthlete[], today: string): AthleteLoad[] {
  const rows = athletes.map((a): AthleteLoad => {
    let plannedToDate = 0;
    let done = 0;
    for (const day of a.days) {
      if (day.date > today) continue;
      done += day.activities.reduce((s, x) => s + (x.load ?? 0), 0);
      plannedToDate += day.workouts.filter((w) => day.date < today || w.done).reduce((s, w) => s + (w.load ?? 0), 0);
    }
    const planned = a.days.reduce((s, d) => s + d.workouts.reduce((t, w) => t + (w.load ?? 0), 0), 0);
    const base = { id: a.id, name: a.name, usual: a.load.usual };
    if (a.error) return { ...base, planned: 0, plannedToDate: 0, done: 0, status: 'indisponible' };
    return { ...base, planned: Math.round(planned), plannedToDate: Math.round(plannedToDate), done: Math.round(done), status: statusOf(plannedToDate, done, planned) };
  });
  return rows.sort((x, y) => {
    const byStatus = ORDER.indexOf(x.status) - ORDER.indexOf(y.status);
    if (byStatus !== 0) return byStatus;
    // En retard : le plus grand écart d'abord.
    if (x.status === 'retard') return x.done / x.plannedToDate - y.done / y.plannedToDate;
    return x.name.localeCompare(y.name, 'fr');
  });
}

/** Valeur de référence de l'axe : la plus grande charge affichée (prévue ou faite), au moins 1. */
export function loadScale(rows: AthleteLoad[]): number {
  return Math.max(1, ...rows.map((r) => Math.max(r.planned, r.done)));
}
