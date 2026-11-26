/**
 * Fitness / Fatigue / Forme calculés par l'app à partir des charges journalières.
 * Fonctions pures. Fitness = tendance sur 42 jours, Fatigue = tendance sur 7 jours.
 */

const FITNESS_K = 1 - Math.exp(-1 / 42);
const FATIGUE_K = 1 - Math.exp(-1 / 7);
const DAY = 24 * 60 * 60 * 1000;
const RAMP_DAYS = 7;

export interface FitnessDay {
  /** AAAA-MM-JJ. */
  date: string;
  /** Charge du jour (somme des sorties). */
  load: number;
  fitness: number;
  fatigue: number;
  /** Forme du matin : fitness et fatigue de la veille. */
  form: number;
  /** Hausse de fitness sur 7 jours ; null si le jour précédent 7 n'est pas dans la série. */
  ramp: number | null;
}

/** Point de départ : fitness et fatigue du premier jour (wellness Intervals.icu de ce jour, sinon 0). */
export interface FitnessSeed {
  ctl: number;
  atl: number;
}

const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Nombre de jours entre deux dates AAAA-MM-JJ (to − from). */
function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/**
 * Série jour par jour de `from` à `to` (inclus). `loads` : charge par jour
 * (les jours absents valent 0). Le premier jour reprend `seed` tel quel (il
 * contient déjà ses charges) ; les jours suivants évoluent avec la charge.
 */
export function fitnessSeries(loads: ReadonlyMap<string, number>, from: string, to: string, seed: FitnessSeed = { ctl: 0, atl: 0 }): FitnessDay[] {
  const n = dayCount(from, to);
  if (n < 0) return [];
  const out: FitnessDay[] = [];
  let fitness = seed.ctl;
  let fatigue = seed.atl;
  for (let i = 0; i <= n; i++) {
    const date = addDays(from, i);
    const load = loads.get(date) ?? 0;
    const form = i === 0 ? fitness - fatigue : out[i - 1].fitness - out[i - 1].fatigue;
    if (i > 0) {
      fitness = fitness + (load - fitness) * FITNESS_K;
      fatigue = fatigue + (load - fatigue) * FATIGUE_K;
    }
    const ramp = i >= RAMP_DAYS ? fitness - out[i - RAMP_DAYS].fitness : null;
    out.push({ date, load, fitness, fatigue, form, ramp });
  }
  return out;
}
