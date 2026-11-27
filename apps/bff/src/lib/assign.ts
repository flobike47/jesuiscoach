/**
 * « Attribuer au meilleur jour » : pour chaque athlète, choisit le jour de la
 * fenêtre et la variante (courte / standard / longue) d'une séance, avec les
 * raisons en clair. Moteur pur : la route (routes/assign.ts) rassemble les
 * données, ici aucun accès réseau ni base.
 *
 * Principe : un score par jour candidat (100 au départ), des jours exclus
 * (repos prescrit, indisponible, trop court, blessure), des pénalités nommées ci-dessous ;
 * on garde le meilleur score, le plus tôt à égalité.
 */

/** Forme (fitness − fatigue) en dessous de laquelle l'athlète est en surcharge. */
export const OVERLOAD_FORM = -30;
/** Forme au-dessus de laquelle l'athlète est frais : la variante longue devient possible. */
export const FRESH_FORM = 5;
/** Intensité (1 = seuil) à partir de laquelle une séance est « intense ». */
export const INTENSE = 0.85;
/** Charge de la semaine tolérée au-dessus de l'habitude. */
export const WEEK_OVERLOAD = 1.15;
/** VFC du jour sous la moyenne des 7 derniers jours au-delà de ce ratio : récupération incomplète. */
export const LOW_HRV = 0.9;
/** Jours sans sortie à partir desquels on parle de reprise : variante courte. */
export const RESTART_DAYS = 10;
/** Nuit plus courte que ça (secondes) : séance exigeante déconseillée le lendemain. */
export const SHORT_NIGHT = 6 * 3600;

const PENALTY = {
  /** Séance intense collée à une autre séance intense (veille ou lendemain). */
  backToBack: 40,
  /** La semaine dépasserait la charge habituelle de plus de 15 %. */
  heavyWeek: 25,
  /** Remplacer une séance déjà prévue plutôt qu'utiliser un jour libre. */
  replace: 20,
  /** VFC basse ou nuit courte : on évite le premier jour de la fenêtre. */
  recovery: 15,
} as const;
/** En surcharge : bonus par jour de plus, pour laisser 48 h faciles avant. */
const LATER_BONUS = 6;
/**
 * Étalement de l'équipe : pénalité par athlète déjà placé le même jour.
 * Faible (inférieure aux vraies contraintes) : elle départage les jours
 * équivalents pour ne pas mettre toute l'équipe le lundi.
 */
const CROWD = 4;

const VARIANT_SCALE = { courte: 0.75, standard: 1, longue: 4 / 3 } as const;
export type Variant = keyof typeof VARIANT_SCALE;

export interface AssignWorkout {
  seconds: number;
  load: number;
  /** 1 = une heure au seuil. */
  intensity: number;
}

export interface AssignDay {
  date: string;
  /** Jour de la fenêtre de placement (sinon : contexte, veille ou lendemain). */
  inWindow: boolean;
  availability: 'repos' | 'indisponible' | null;
  /** Repos prescrit par le coach ce jour-là : aucune séance n'y est proposée. */
  rest: boolean;
  /** Durée maximale ce jour-là (minutes), d'après les disponibilités habituelles. */
  maxMinutes: number | null;
  /** Séances déjà prévues ce jour-là. */
  existing: Array<{ id: string; name: string; load: number; intensity: number }>;
  /** Charge des sorties déjà faites ce jour-là. */
  doneLoad: number;
  /** Avertissement bloquant (blessure) pour cette séance ce jour-là. */
  blocked: string | null;
}

export interface AssignAthlete {
  id: string;
  name: string;
  /** Jours du contexte et de la fenêtre, dans l'ordre. */
  days: AssignDay[];
  /** Forme du jour (fitness − fatigue), null si inconnue. */
  form: number | null;
  /** VFC des derniers jours, la plus récente en dernier. */
  hrv: number[];
  /** Durée de la dernière nuit (secondes), null si inconnue. */
  lastSleep: number | null;
  /** Charge hebdomadaire habituelle (moyenne des 4 semaines précédentes), null si inconnue. */
  usualWeekLoad: number | null;
  /** Jours depuis la dernière sortie, null si inconnu. */
  daysSinceRide: number | null;
}

export interface Suggestion {
  athleteId: string;
  name: string;
  date: string | null;
  variant: Variant;
  intensityScale: number;
  reasons: string[];
  alternatives: string[];
  replaces: { eventId: string; name: string } | null;
  blocked: string | null;
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
/** Lundi de la semaine d'un jour (AAAA-MM-JJ). */
function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function formLabel(form: number | null): string | null {
  if (form == null) return null;
  if (form < OVERLOAD_FORM) return 'Surcharge';
  if (form < -10) return 'Productif';
  if (form <= FRESH_FORM) return 'Neutre';
  return 'Frais';
}

/** Variante selon la forme ; la longue seulement si le jour le permet (vérifié au placement). */
function variantFor(form: number | null): Variant {
  if (form != null && form < OVERLOAD_FORM) return 'courte';
  if (form != null && form > FRESH_FORM) return 'longue';
  return 'standard';
}

interface Candidate {
  day: AssignDay;
  score: number;
  reasons: string[];
  replaces: Suggestion['replaces'];
  variant: Variant;
}

/** Une suggestion par athlète. */
export function suggest(workout: AssignWorkout, athletes: AssignAthlete[]): Suggestion[] {
  // Les plus contraints d'abord (moins de jours possibles), puis étalement des autres.
  const crowd = new Map<string, number>();
  const order = [...athletes].sort((x, y) => openDays(x) - openDays(y));
  const byId = new Map<string, Suggestion>();
  for (const a of order) {
    const s = suggestFor(workout, a, crowd);
    if (s.date) crowd.set(s.date, (crowd.get(s.date) ?? 0) + 1);
    byId.set(a.id, s);
  }
  return athletes.map((a) => byId.get(a.id)!);
}

const openDays = (a: AssignAthlete) => a.days.filter((d) => d.inWindow && !d.rest && !d.availability && !d.blocked).length;

export function suggestFor(workout: AssignWorkout, a: AssignAthlete, crowd: ReadonlyMap<string, number> = new Map()): Suggestion {
  const base: Suggestion = { athleteId: a.id, name: a.name, date: null, variant: 'standard', intensityScale: 1, reasons: [], alternatives: [], replaces: null, blocked: null };
  const window = a.days.filter((d) => d.inWindow);
  const intense = workout.intensity >= INTENSE;
  const overloaded = a.form != null && a.form < OVERLOAD_FORM;
  // Après un arrêt, la forme paraît « fraîche » : on reprend court, quelle que soit la forme.
  const restarting = a.daysSinceRide != null && a.daysSinceRide >= RESTART_DAYS;
  const wanted = restarting ? 'courte' : variantFor(a.form);

  const hrvLow = a.hrv.length >= 3 && a.hrv[a.hrv.length - 1] < LOW_HRV * (a.hrv.slice(-8, -1).reduce((s, v) => s + v, 0) / Math.max(1, a.hrv.slice(-8, -1).length));
  const shortNight = a.lastSleep != null && a.lastSleep < SHORT_NIGHT;

  const candidates: Candidate[] = [];
  const excluded: string[] = [];
  window.forEach((day, i) => {
    if (day.blocked) return void excluded.push(day.blocked);
    if (day.rest) return void excluded.push('repos prescrit');
    if (day.availability) return void excluded.push(day.availability === 'repos' ? 'repos' : 'indisponible');

    // Variante : la longue redescend en standard si le jour est trop court ; exclu si même la séance standard ne tient pas.
    let variant = wanted;
    const fits = (v: Variant) => day.maxMinutes == null || workout.seconds * VARIANT_SCALE[v] <= day.maxMinutes * 60;
    if (variant === 'longue' && !fits('longue')) variant = 'standard';
    if (!fits(variant)) return void excluded.push('trop court');

    const reasons: string[] = [];
    let score = 100;
    let replaces: Suggestion['replaces'] = null;

    if (day.existing.length > 0) {
      // On ne remplace qu'une séance plus légère ; sinon le jour est pris.
      const heavier = day.existing.find((e) => e.load >= workout.load);
      if (heavier) return void excluded.push('occupé');
      const replaced = day.existing[0];
      replaces = { eventId: replaced.id, name: replaced.name };
      score -= PENALTY.replace;
      reasons.push(`Remplace « ${replaced.name} » de ${weekday(day.date)}`);
    }

    const index = a.days.indexOf(day);
    const neighbours = [a.days[index - 1], a.days[index + 1]].filter(Boolean);
    if (intense && neighbours.some((n) => n.existing.some((e) => e.intensity >= INTENSE))) {
      score -= PENALTY.backToBack;
      reasons.push('Séance intense la veille ou le lendemain');
    }

    if (a.usualWeekLoad) {
      const monday = mondayOf(day.date);
      const weekLoad = a.days
        .filter((d) => mondayOf(d.date) === monday)
        .reduce((s, d) => s + d.doneLoad + d.existing.filter((e) => e.id !== replaces?.eventId).reduce((t, e) => t + e.load, 0), 0);
      const after = weekLoad + workout.load * VARIANT_SCALE[variant];
      if (after > a.usualWeekLoad * WEEK_OVERLOAD) {
        score -= PENALTY.heavyWeek;
        reasons.push(`Semaine déjà chargée (+${Math.round((after / a.usualWeekLoad - 1) * 100)} %)`);
      }
    }

    if (i === 0 && (hrvLow || shortNight)) {
      score -= PENALTY.recovery;
      reasons.push(hrvLow ? 'VFC basse ce matin' : 'Nuit courte');
    }

    if (overloaded) score += i * LATER_BONUS;
    score -= CROWD * (crowd.get(day.date) ?? 0);
    candidates.push({ day, score, reasons, replaces, variant });
  });

  if (candidates.length === 0) {
    const blockedBy = window.find((d) => d.blocked)?.blocked;
    return {
      ...base,
      variant: wanted,
      blocked: blockedBy ?? (excluded.length ? 'Aucun jour possible dans la fenêtre' : 'Fenêtre vide'),
      reasons: [blockedBy ? blockedBy : `Aucun jour libre (${[...new Set(excluded)].join(', ')})`],
    };
  }

  // Meilleur score ; à égalité, le plus tôt (tri stable sur l'ordre chronologique).
  const ranked = [...candidates].sort((x, y) => y.score - x.score);
  const best = ranked[0];
  const reasons = [restarting ? `Reprise après ${a.daysSinceRide} jours sans sortie` : summary(a, best, overloaded), ...best.reasons].slice(0, 3);
  return {
    ...base,
    date: best.day.date,
    variant: best.variant,
    intensityScale: overloaded ? 0.95 : 1,
    reasons,
    alternatives: ranked.slice(1, 4).map((c) => c.day.date),
    replaces: best.replaces,
  };
}

/** Première raison, affichée sous le nom : l'état et pourquoi ce jour. */
function summary(a: AssignAthlete, c: Candidate, overloaded: boolean): string {
  if (overloaded) return 'Surcharge : 48 h faciles avant';
  const state = formLabel(a.form);
  const free = c.replaces ? null : c.day.maxMinutes ? `${weekday(c.day.date)} libre ${formatMinutes(c.day.maxMinutes)}` : `${weekday(c.day.date)} libre`;
  return [state, free].filter(Boolean).join(' · ') || `Placée ${weekday(c.day.date)}`;
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`) : `${m} min`;
}
