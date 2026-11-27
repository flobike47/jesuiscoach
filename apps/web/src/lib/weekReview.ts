import dayjs from 'dayjs';
import type { TeamCalendar, TeamCalendarAthlete } from '@/types';
import { OVERLOAD_RATIO } from '@/lib/teamPlanning';

/**
 * Résumé de la semaine du coach (« l'écran du lundi matin ») : charge prévue
 * contre charge faite, séances manquées et athlètes au-dessus de leur charge
 * habituelle. Pur, sans React : tout vient de /team/calendar (aucun appel
 * Intervals.icu de plus). Ne s'appuie jamais sur le nom des séances (absent
 * en démo).
 */

const DAY_MS = 86_400_000;
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Lundi de la semaine d'un jour (AAAA-MM-JJ). */
export function mondayOf(day: string): string {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return shift(day, -weekday);
}

/** Semaine (lundi → dimanche) commençant au lundi donné. */
export function weekRange(monday: string): { from: string; to: string } {
  return { from: monday, to: shift(monday, 6) };
}

/** Semaine écoulée : celle qu'on relit le lundi matin (lundi → dimanche précédents). */
export function lastWeekRange(today: string): { from: string; to: string } {
  return weekRange(shift(mondayOf(today), -7));
}

/** Semaine décalée de `weeks` semaines (navigation dans le détail). */
export function shiftWeek(monday: string, weeks: number): string {
  return shift(monday, weeks * 7);
}

export interface AthleteWeekReview {
  id: string;
  name: string;
  /** Lecture impossible pour cet athlète : exclu des totaux. */
  error: string | null;
  /** Charge prévue des séances estimables (les séances sans structure n'ont pas de charge). */
  planned: number;
  /** Séances prévues sans charge estimable (séance sans structure, démo). */
  unestimated: number;
  done: number;
  /** Charge habituelle sur la même durée (4 semaines précédentes), null si inconnue. */
  usual: number | null;
  sessions: number;
  sessionsDone: number;
  /** Séances prévues un jour passé et non faites. */
  missed: number;
  /** Charge faite au-delà de l'habitude (+15 %). */
  overUsual: boolean;
  /** Écart à l'habitude en % (arrondi), null si l'habitude est inconnue. */
  usualPct: number | null;
}

export interface WeekReview {
  from: string;
  to: string;
  athletes: AthleteWeekReview[];
  totals: {
    /** Charge prévue estimable de l'équipe, et nombre de séances sans charge estimable. */
    planned: number;
    unestimated: number;
    done: number;
    sessions: number;
    sessionsDone: number;
    missed: number;
    overUsual: number;
    /** Athlètes dont la lecture a échoué. */
    unavailable: number;
  };
}

function reviewAthlete(a: TeamCalendarAthlete, from: string, to: string, today: string): AthleteWeekReview {
  const days = a.days.filter((d) => d.date >= from && d.date <= to);
  const workouts = days.flatMap((d) => d.workouts.map((w) => ({ ...w, date: d.date })));
  const planned = Math.round(workouts.reduce((s, w) => s + (w.load ?? 0), 0));
  const unestimated = workouts.filter((w) => w.load == null).length;
  const done = Math.round(days.reduce((s, d) => s + d.activities.reduce((t, x) => t + (x.load ?? 0), 0), 0));
  const usual = a.load.usual != null && a.load.usual > 0 ? a.load.usual : null;
  return {
    id: a.id,
    name: a.name,
    error: a.error,
    planned,
    unestimated,
    done,
    usual,
    sessions: workouts.length,
    sessionsDone: workouts.filter((w) => w.done).length,
    missed: workouts.filter((w) => !w.done && w.date < today).length,
    overUsual: usual != null && done > usual * OVERLOAD_RATIO,
    usualPct: usual != null ? Math.round((done / usual - 1) * 100) : null,
  };
}

/** Ordre d'affichage : d'abord ceux à suivre (au-dessus de l'habitude, puis séances manquées), puis par nom ; erreurs en dernier. */
function byConcern(x: AthleteWeekReview, y: AthleteWeekReview): number {
  const rank = (r: AthleteWeekReview) => (r.error ? 3 : r.overUsual ? 0 : r.missed > 0 ? 1 : 2);
  return rank(x) - rank(y) || y.missed - x.missed || x.name.localeCompare(y.name, 'fr');
}

/** Résumé de la semaine `from` → `to` à partir du planning d'équipe. `today` décide ce qui est « manqué ». */
export function weekReview(cal: TeamCalendar, from: string, to: string, today: string): WeekReview {
  const athletes = cal.athletes.map((a) => reviewAthlete(a, from, to, today)).sort(byConcern);
  const ok = athletes.filter((a) => !a.error);
  return {
    from,
    to,
    athletes,
    totals: {
      planned: ok.reduce((s, a) => s + a.planned, 0),
      unestimated: ok.reduce((s, a) => s + a.unestimated, 0),
      done: ok.reduce((s, a) => s + a.done, 0),
      sessions: ok.reduce((s, a) => s + a.sessions, 0),
      sessionsDone: ok.reduce((s, a) => s + a.sessionsDone, 0),
      missed: ok.reduce((s, a) => s + a.missed, 0),
      overUsual: ok.filter((a) => a.overUsual).length,
      unavailable: athletes.length - ok.length,
    },
  };
}

/** Athlètes à suivre : au-dessus de l'habitude ou avec des séances manquées. */
export const needsAttention = (a: AthleteWeekReview): boolean => !a.error && (a.overUsual || a.missed > 0);

/** « 23 – 29 nov. » */
export function weekLabel(from: string, to: string): string {
  return `${dayjs(from).format('D')} – ${dayjs(to).format('D MMM')}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Pourquoi un athlète est à suivre, en une ligne (« +17 % de son habitude · 2 séances manquées »). */
export function attentionReason(a: AthleteWeekReview): string {
  return [a.overUsual && a.usualPct != null ? `+${a.usualPct} % de son habitude` : null, a.missed > 0 ? plural(a.missed, 'séance manquée', 'séances manquées') : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Charge prévue en clair : « 140 prévue », « 140 prévue (+1 non estimée) »,
 * « prévue non estimée » (aucune séance estimable : jamais « 0 »), « rien de prévu ».
 */
export function plannedLabel(p: { planned: number; unestimated: number; sessions: number }): string {
  if (p.sessions === 0) return 'rien de prévu';
  if (p.unestimated >= p.sessions) return 'prévue non estimée';
  const extra = p.unestimated ? ` (+${p.unestimated} non estimée${p.unestimated > 1 ? 's' : ''})` : '';
  return `${Math.round(p.planned)} prévue${extra}`;
}
