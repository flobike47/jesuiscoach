import { SPORTS, validateSport, type Sport } from './sport.js';
import { BadRequest, validateString } from '../validation.js';

/**
 * Fiche profil « soin » : semaine type, matériel, exceptions, blessures, et
 * avertissements à l'envoi d'une séance. Module pur (pas d'accès base ni réseau).
 */

export const SLOTS = ['any', 'morning', 'noon', 'evening'] as const;
export type Slot = (typeof SLOTS)[number];
export const PLACES = ['any', 'outdoor', 'indoor'] as const;
export type Place = (typeof PLACES)[number];

/** Bornes : exceptions et blessures par athlète (lignes en base, insertion atomique). */
export const CARE_LIMITS = { maxExceptions: 30, maxInjuries: 30, maxMinutesPerDay: 720, minMinutesPerDay: 10, maxWeeklyMinutes: 3000 } as const;

export interface DayAvailability {
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  available: boolean;
  maxMinutes: number | null;
  slot: Slot;
  place: Place;
}

export interface AvailabilityException {
  id: string;
  fromDay: string;
  toDay: string;
  note: string | null;
}

export interface Equipment {
  powerMeter: boolean;
  hrStrap: boolean;
  smartTrainer: boolean;
  poolAccess: boolean;
}

export interface Injury {
  id: string;
  title: string;
  startedOn: string;
  expectedEnd: string | null;
  endedOn: string | null;
  avoidSports: Sport[];
  avoidIntensity: boolean;
  note: string | null;
}

export interface CareState {
  weeklyMinutes: number | null;
  days: DayAvailability[];
  exceptions: AvailabilityException[];
  equipment: Equipment;
  injuries: Injury[];
  updatedBy: 'athlete' | 'coach';
  updatedAt: string | null;
}

export type AvailabilityInput = Pick<CareState, 'weeklyMinutes' | 'days'>;
export type ExceptionInput = Omit<AvailabilityException, 'id'>;
export type InjuryInput = Omit<Injury, 'id'>;

/** Semaine par défaut : tous les jours disponibles, sans limite. */
export function defaultDays(): DayAvailability[] {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, available: true, maxMinutes: null, slot: 'any' as Slot, place: 'any' as Place }));
}

export const DEFAULT_EQUIPMENT: Equipment = { powerMeter: false, hrStrap: false, smartTrainer: false, poolAccess: false };

/* ---------- Dates ---------- */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Vrai pour « AAAA-MM-JJ » existant (rejette 2026-02-30). */
export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Jour de la semaine (0 = lundi) d'une date AAAA-MM-JJ. */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** « 15 déc. » (format fixe, indépendant de l'ICU du serveur). */
export function formatDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** Minutes → « 45 min », « 1 h », « 1 h 30 ». */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/* ---------- Blessures ---------- */

/**
 * Blessure en cours à `day` : commencée, pas encore guérie, et dans la durée
 * annoncée (règle du plan A2).
 */
export function isInjuryActive(injury: Pick<Injury, 'startedOn' | 'endedOn' | 'expectedEnd'>, day: string): boolean {
  return injury.startedOn <= day && (injury.endedOn == null || injury.endedOn >= day) && (injury.expectedEnd == null || injury.expectedEnd >= day);
}

/** Répartit les blessures entre « en cours » et « passées » à la date `today`. */
export function splitInjuries(injuries: Injury[], today: string): { current: Injury[]; past: Injury[] } {
  return {
    current: injuries.filter((i) => isInjuryActive(i, today)),
    past: injuries.filter((i) => !isInjuryActive(i, today)),
  };
}

/* ---------- Avertissements à l'envoi ---------- */

export interface WorkoutCheck {
  date: string;
  sport: Sport;
  /** Durée estimée de la séance, ou null si inconnue. */
  durationSec: number | null;
  usesPower: boolean;
  highIntensity: boolean;
}

export interface Warning {
  kind: 'injury' | 'availability' | 'exception' | 'equipment';
  /** block : l'envoi est bloqué sans confirmation ; warn : simple avertissement. */
  level: 'block' | 'warn';
  title: string;
  detail: string;
  /** Jour conseillé pour la séance (durée trop longue pour ce jour). */
  suggestDate?: string;
}

export interface CareContext {
  name: string;
  state: Pick<CareState, 'days' | 'exceptions' | 'equipment' | 'injuries'>;
}

/** Termine une phrase par un point, sans doubler celui d'une abréviation (« 15 déc. »). */
const sentence = (s: string): string => (s.endsWith('.') ? s : `${s}.`);

const SPORT_LABEL: Record<Sport, string> = { Ride: 'vélo', Run: 'course', Swim: 'natation' };

function exceptionOn(day: string, exceptions: AvailabilityException[]): AvailabilityException | undefined {
  return exceptions.find((e) => e.fromDay <= day && day <= e.toDay);
}

/** Jour (dans les 7 jours suivants) disponible, sans exception, où la séance tient. */
function suggestDay(w: WorkoutCheck, ctx: CareContext['state']): string | undefined {
  for (let i = 1; i <= 7; i++) {
    const day = addDays(w.date, i);
    const d = ctx.days[weekdayOf(day)];
    if (!d.available) continue;
    if (d.maxMinutes != null && (w.durationSec ?? 0) > d.maxMinutes * 60) continue;
    if (exceptionOn(day, ctx.exceptions)) continue;
    return day;
  }
  return undefined;
}

/**
 * Avertissements pour une séance envoyée à un athlète. Un blocage (`block`)
 * n'est pas envoyé sans confirmation explicite (`force` côté route).
 */
export function checkWorkout(w: WorkoutCheck, athlete: CareContext): Warning[] {
  const { name, state } = athlete;
  const warnings: Warning[] = [];
  const label = SPORT_LABEL[w.sport];

  for (const injury of state.injuries) {
    if (!isInjuryActive(injury, w.date)) continue;
    const until = injury.expectedEnd ? ` jusqu'au ${formatDay(injury.expectedEnd)}` : " pour l'instant";
    if (injury.avoidSports.includes(w.sport)) {
      warnings.push({ kind: 'injury', level: 'block', title: `Blessure en cours : ${injury.title}`, detail: sentence(`${name} : pas de ${label}${until}`) });
    } else if (injury.avoidIntensity && w.highIntensity) {
      warnings.push({
        kind: 'injury',
        level: 'block',
        title: `Blessure en cours : ${injury.title}`,
        detail: sentence(`${name} : pas d'effort au-dessus du seuil${until}`),
      });
    }
  }

  const exception = exceptionOn(w.date, state.exceptions);
  if (exception) {
    const period = exception.fromDay === exception.toDay ? `le ${formatDay(exception.fromDay)}` : `du ${formatDay(exception.fromDay)} au ${formatDay(exception.toDay)}`;
    warnings.push({ kind: 'exception', level: 'block', title: 'Athlète indisponible', detail: sentence(`${name} est indisponible ${period}`) });
  }

  const day = state.days[weekdayOf(w.date)];
  if (day && !day.available) {
    warnings.push({ kind: 'availability', level: 'warn', title: 'Jour de repos', detail: sentence(`${name} ne s'entraîne pas le ${WEEKDAYS[day.weekday]}`) });
  } else if (day && w.durationSec != null && day.maxMinutes != null && w.durationSec > day.maxMinutes * 60) {
    const suggestDate = suggestDay(w, state);
    warnings.push({
      kind: 'availability',
      level: 'warn',
      title: 'Temps disponible dépassé',
      detail: sentence(`${name} n'a qu'${formatMinutes(day.maxMinutes)} ${WEEKDAYS[day.weekday]}`),
      ...(suggestDate ? { suggestDate } : {}),
    });
  }

  if (w.sport === 'Ride' && w.usesPower && !state.equipment.powerMeter && !state.equipment.smartTrainer) {
    warnings.push({ kind: 'equipment', level: 'warn', title: 'Matériel', detail: sentence(`${name} n'a pas de capteur de puissance.`) });
  }

  return warnings;
}

/* ---------- Validation des entrées ---------- */

function fail(msg: string): never {
  throw new BadRequest(msg);
}

function bool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') fail(`${name} doit être un booléen`);
  return v as boolean;
}

function optionalDay(v: unknown, name: string): string | null {
  if (v == null) return null;
  if (!isDay(v)) fail(`${name} invalide (AAAA-MM-JJ)`);
  return v as string;
}

function optionalNote(v: unknown, max: number): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') fail('note invalide');
  return validateString(v, 'note', max);
}

function optionalInt(v: unknown, min: number, max: number, name: string): number | null {
  if (v == null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail(`${name} invalide (${min} à ${max})`);
  return v as number;
}

/** Semaine type : exactement 7 jours, chacun une fois. */
export function validateAvailability(body: unknown): AvailabilityInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const weeklyMinutes = optionalInt(b.weeklyMinutes, 0, CARE_LIMITS.maxWeeklyMinutes, 'weeklyMinutes');
  if (!Array.isArray(b.days) || b.days.length !== 7) fail('days : 7 jours attendus');
  const days: DayAvailability[] = [];
  const seen = new Set<number>();
  for (const raw of b.days as unknown[]) {
    const d = (raw ?? {}) as Record<string, unknown>;
    const weekday = optionalInt(d.weekday, 0, 6, 'weekday');
    if (weekday == null || seen.has(weekday)) fail('weekday : chaque jour une seule fois');
    seen.add(weekday);
    const available = bool(d.available, 'available');
    const maxMinutes = optionalInt(d.maxMinutes, CARE_LIMITS.minMinutesPerDay, CARE_LIMITS.maxMinutesPerDay, 'maxMinutes');
    const slot = d.slot ?? 'any';
    const place = d.place ?? 'any';
    if (!(SLOTS as readonly unknown[]).includes(slot)) fail('slot invalide');
    if (!(PLACES as readonly unknown[]).includes(place)) fail('place invalide');
    days.push({ weekday, available, maxMinutes, slot: slot as Slot, place: place as Place });
  }
  return { weeklyMinutes, days: days.sort((x, y) => x.weekday - y.weekday) };
}

export function validateEquipment(body: unknown): Equipment {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    powerMeter: bool(b.powerMeter, 'powerMeter'),
    hrStrap: bool(b.hrStrap, 'hrStrap'),
    smartTrainer: bool(b.smartTrainer, 'smartTrainer'),
    poolAccess: bool(b.poolAccess, 'poolAccess'),
  };
}

export function validateException(body: unknown): ExceptionInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const fromDay = optionalDay(b.fromDay, 'fromDay');
  const toDay = optionalDay(b.toDay, 'toDay');
  if (!fromDay || !toDay) fail('fromDay et toDay requis (AAAA-MM-JJ)');
  if (toDay < fromDay) fail('toDay doit être après fromDay');
  return { fromDay, toDay, note: optionalNote(b.note, 200) };
}

export function validateInjury(body: unknown): InjuryInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.title !== 'string') fail('title requis');
  const title = validateString(b.title as string, 'title', 120);
  const startedOn = optionalDay(b.startedOn, 'startedOn');
  if (!startedOn) fail('startedOn requis (AAAA-MM-JJ)');
  const expectedEnd = optionalDay(b.expectedEnd, 'expectedEnd');
  const endedOn = optionalDay(b.endedOn, 'endedOn');
  if (expectedEnd && expectedEnd < startedOn) fail('expectedEnd doit être après startedOn');
  if (endedOn && endedOn < startedOn) fail('endedOn doit être après startedOn');
  if (b.avoidSports != null && !Array.isArray(b.avoidSports)) fail('avoidSports doit être un tableau');
  const avoidSports = [...new Set(((b.avoidSports as unknown[] | undefined) ?? []).map((s) => validateSport(s)))].filter((s) => SPORTS.includes(s));
  return {
    title,
    startedOn,
    expectedEnd,
    endedOn,
    avoidSports,
    avoidIntensity: b.avoidIntensity == null ? false : bool(b.avoidIntensity, 'avoidIntensity'),
    note: optionalNote(b.note, 500),
  };
}

/** Paramètres d'une séance pour les avertissements (route de vérification et envoi). Absents = inconnus (pas de contrôle de durée ni de matériel). */
export function validateWorkoutCheck(body: unknown): WorkoutCheck {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isDay(b.date)) fail('date invalide (AAAA-MM-JJ)');
  const durationSec = b.durationSec == null ? null : b.durationSec;
  if (durationSec !== null && (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0 || durationSec > 86_400)) {
    fail('durationSec invalide');
  }
  return {
    date: b.date as string,
    sport: validateSport(b.sport),
    durationSec: durationSec as number | null,
    usesPower: b.usesPower == null ? false : bool(b.usesPower, 'usesPower'),
    highIntensity: b.highIntensity == null ? false : bool(b.highIntensity, 'highIntensity'),
  };
}

/** Disponibilité d'un jour : exception (« indisponible ») ou jour habituel sans sortie (« repos »). */
export function availabilityOf(day: string, state: Pick<CareState, 'days' | 'exceptions'>): 'repos' | 'indisponible' | null {
  if (state.exceptions.some((e) => e.fromDay <= day && day <= e.toDay)) return 'indisponible';
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  const d = state.days.find((x) => x.weekday === weekday);
  return d && !d.available ? 'repos' : null;
}
