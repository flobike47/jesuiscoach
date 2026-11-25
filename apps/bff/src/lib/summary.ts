import { matchPlan } from './plan.js';
import type {
  Alert,
  AthleteSummary,
  IntervalsActivity,
  IntervalsAthlete,
  IntervalsEvent,
  IntervalsWellness,
} from '../types.js';

/** Seuils des alertes coach (repris de la démo Python). */
export const THRESHOLDS = {
  /** Forme (fitness − fatigue) en dessous → fatigue élevée. */
  formFatigue: -30,
  /** Hausse de fitness par semaine au-delà → montée de charge trop rapide. */
  rampMax: 8,
  /** Jours sans sortie → inactif. */
  inactiveDays: 7,
} as const;

const DAY = 24 * 60 * 60 * 1000;
const isRide = (a: IntervalsActivity) => (a.type ?? '').includes('Ride');
const dayOf = (iso: string) => iso.slice(0, 10);

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ftpOf(info: IntervalsAthlete): number | null {
  const ride = info.sportSettings?.find((s) => s.types?.includes('Ride') && s.ftp);
  return ride?.ftp ?? info.icu_ftp ?? null;
}

export function computeAlerts(s: Pick<AthleteSummary, 'form' | 'ramp' | 'daysSinceRide' | 'plannedDone' | 'plannedTotal'>): Alert[] {
  const alerts: Alert[] = [];
  if (s.form < THRESHOLDS.formFatigue) {
    alerts.push({ level: 'high', code: 'fatigue', text: `Fatigue élevée (forme ${signedText(s.form)})` });
  }
  if (s.ramp != null && s.ramp > THRESHOLDS.rampMax) {
    alerts.push({ level: 'high', code: 'ramp', text: `Charge qui monte vite (+${Math.round(s.ramp)} / sem.)` });
  }
  if (s.daysSinceRide == null || s.daysSinceRide >= THRESHOLDS.inactiveDays) {
    alerts.push({
      level: 'warn',
      code: 'inactive',
      text: s.daysSinceRide == null ? 'Aucune sortie depuis 4 semaines' : `Aucune sortie depuis ${s.daysSinceRide} jours`,
    });
  }
  const missed = s.plannedTotal - s.plannedDone;
  if (missed > 0) {
    alerts.push({ level: 'warn', code: 'missed', text: `${missed} séance${missed > 1 ? 's' : ''} prévue${missed > 1 ? 's' : ''} non faite${missed > 1 ? 's' : ''}` });
  }
  return alerts;
}

/**
 * Résumé d'un athlète pour le tableau « Équipe ».
 * `wellness` : 14 derniers jours, `activities` : 28 derniers jours,
 * `events` : de J−7 à J+7.
 */
export function summarize(
  info: IntervalsAthlete,
  wellness: IntervalsWellness[],
  activities: IntervalsActivity[],
  events: IntervalsEvent[],
  now: Date,
): AthleteSummary {
  const today = isoDay(now);
  const weekAgo = isoDay(new Date(now.getTime() - 7 * DAY));

  const last = [...wellness].reverse().find((w) => w.ctl != null) ?? {};
  const fitness = (last as IntervalsWellness).ctl ?? 0;
  const fatigue = (last as IntervalsWellness).atl ?? 0;
  const ramp = (last as IntervalsWellness).rampRate ?? null;

  const rides = activities.filter(isRide);
  const week = rides.filter((a) => dayOf(a.start_date_local) > weekAgo);
  const lastRide = rides.map((a) => dayOf(a.start_date_local)).sort().at(-1) ?? null;
  const daysSinceRide = lastRide ? Math.round((Date.parse(today) - Date.parse(lastRide)) / DAY) : null;

  // Conformité : séances passées réalisées (appariement Intervals.icu, sinon même jour).
  const { activityOf } = matchPlan(events, activities);
  const pastPlan = events.filter((e) => e.category === 'WORKOUT' && dayOf(e.start_date_local) >= weekAgo && dayOf(e.start_date_local) < today);
  const plannedDone = pastPlan.filter((e) => activityOf.has(e)).length;

  const base = {
    id: info.id,
    name: info.name ?? info.id,
    ftp: ftpOf(info),
    fitness: round1(fitness),
    fatigue: round1(fatigue),
    form: round1(fitness - fatigue),
    ramp: ramp == null ? null : round1(ramp),
    weekLoad: Math.round(week.reduce((s, a) => s + (a.icu_training_load ?? 0), 0)),
    weekHours: round1(week.reduce((s, a) => s + (a.moving_time ?? 0), 0) / 3600),
    weekKm: Math.round(week.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000),
    lastRide,
    daysSinceRide,
    plannedDone,
    plannedTotal: pastPlan.length,
  };
  return { ...base, alerts: computeAlerts(base) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** « −34 » avec le vrai signe moins typographique (U+2212). */
function signedText(n: number): string {
  const r = Math.round(n);
  return r < 0 ? `−${Math.abs(r)}` : String(r);
}
