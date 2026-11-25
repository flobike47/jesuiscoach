import { formatClock } from '@/lib/numberInput';
import type { SuggestionField } from '@/services/profileApi';
import type { Sport } from '@/types';

/**
 * Fiche profil : formats et zones calculées. Pur (sans React).
 * Les bornes reprennent exactement celles du BFF (apps/bff/src/lib/profile.ts).
 */

/** Bornes et pas des sélecteurs (NumberStepper). */
export const LIMITS = {
  ftp: { min: 50, max: 600, step: 1 },
  lthr: { min: 80, max: 220, step: 1 },
  maxHr: { min: 100, max: 230, step: 1 },
  restingHr: { min: 25, max: 110, step: 1 },
  weightKg: { min: 30, max: 200, step: 0.1 },
  heightCm: { min: 120, max: 230, step: 1 },
  vmaKmh: { min: 8, max: 25, step: 0.1 },
  runThresholdSecs: { min: 150, max: 600, step: 5 },
  swimThresholdSecs: { min: 60, max: 240, step: 1 },
  /** Date de naissance la plus ancienne admise. */
  birthMin: '1930-01-01',
  /** Date de test la plus ancienne admise. */
  testMin: '2000-01-01',
} as const;

/** Seuils des zones de puissance (% de la FTP, Coggan) : 7 zones. */
export const POWER_PCT = [55, 75, 90, 105, 120, 150] as const;
/** Seuils des zones cardio (% de la FC seuil, Friel) : 6 zones. */
export const HR_PCT = [81, 90, 94, 100, 103] as const;

export interface Zone {
  zone: number;
  /** Borne basse incluse ; null pour la première zone. */
  from: number | null;
  /** Borne haute incluse ; null pour la dernière zone. */
  to: number | null;
}

/** Zones issues d'une valeur de référence et de ses seuils en pourcentage. */
export function zonesFrom(base: number, pcts: readonly number[]): Zone[] {
  const bounds = pcts.map((p) => Math.round((base * p) / 100));
  return Array.from({ length: pcts.length + 1 }, (_, i) => ({
    zone: i + 1,
    from: i === 0 ? null : bounds[i - 1],
    to: i === pcts.length ? null : bounds[i] - 1,
  }));
}

/** Allure : 275 s et « km » → « 4:35 /km » ; natation → « 1:55 /100 m ». */
export function formatPace(secs: number, sport: 'Run' | 'Swim'): string {
  return `${formatClock(secs)} ${sport === 'Run' ? '/km' : '/100 m'}`;
}

/** Âge en années pleines à la date `today` (AAAA-MM-JJ). */
export function ageOf(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

/** Naissance la plus récente admise : aujourd'hui moins 10 ans (29 février → 28). */
export function maxBirthDate(today: string): string {
  const [y, m, d] = today.split('-');
  const candidate = `${Number(y) - 10}-${m}-${d}`;
  return isValidDay(candidate) ? candidate : `${Number(y) - 10}-02-28`;
}

export function isValidDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

/** Date du jour au format AAAA-MM-JJ (fuseau local de l'appareil). */
export function todayIso(now = new Date()): string {
  const off = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - off).toISOString().slice(0, 10);
}

/** « 1990-03-14 » → « 14 mars 1990 ». */
export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const SPORT_LABEL: Record<Sport, string> = { Ride: 'Vélo', Run: 'Course', Swim: 'Natation' };

/** Nombre à une décimale au plus, à la française : « 12,3 ». */
export const formatNumber = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Valeur affichée d'un champ de la fiche (ou d'une suggestion). */
export function formatField(field: SuggestionField, sport: Sport | null, value: number | string | null): string {
  if (value == null) return '–';
  switch (field) {
    case 'ftp':
      return `${value} W`;
    case 'lthr':
    case 'maxHr':
    case 'restingHr':
      return `${value} bpm`;
    case 'thresholdSecs':
      return formatPace(Number(value), sport === 'Swim' ? 'Swim' : 'Run');
    case 'weightKg':
      return `${formatNumber(Number(value))} kg`;
    case 'heightCm':
      return `${value} cm`;
    case 'birthDate':
      return formatDay(String(value));
    case 'sex':
      return value === 'M' ? 'Homme' : 'Femme';
  }
}

/** Ne garde que les champs du brouillon qui diffèrent de la valeur enregistrée. */
export function changedOf<T extends object>(draft: Partial<T>, saved: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(draft) as Array<keyof T>) {
    const v = (draft[k] ?? null) as T[keyof T] | null;
    const s = (saved[k] ?? null) as T[keyof T] | null;
    if (v !== s) out[k] = v as T[keyof T];
  }
  return out;
}

