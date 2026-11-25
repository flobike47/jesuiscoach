import type { CareDay, CareEquipment, CareException, Place, Slot } from '@/services/careApi';

/** Résumés et règles d'affichage de la fiche « soin » (pur, sans réseau). */

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;
const DAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const SLOT_LABELS: Record<Slot, string> = { any: 'Indifférent', morning: 'Matin', noon: 'Midi', evening: 'Soir' };
export const PLACE_LABELS: Record<Place, string> = { any: 'Indifférent', outdoor: 'Extérieur', indoor: 'Home trainer' };

/** Jour de la semaine (0 = lundi) d'une date AAAA-MM-JJ. */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** Heures à partir de minutes : « 8 h », « 7,5 h ». */
export function formatHours(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;
}

/** Durée : « 45 min », « 1 h », « 1 h 30 ». */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** « 20 nov. » : date courte sans jour de la semaine (cartes de blessure). */
export function formatDayShort(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** « jeudi 3 déc. » : jour de la semaine et date courte, pour un jour proposé. */
export function formatShortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${DAY_LONG[weekdayOf(day)]} ${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** « 25 novembre 2026 » à partir d'un horodatage ISO. */
export function formatLongDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** « 5 jours · 8 h/sem. » ; le volume est omis tant qu'il n'est pas renseigné. */
export function weekSummary(days: CareDay[], weeklyMinutes: number | null): string {
  const n = days.filter((d) => d.available).length;
  const jours = `${n} jour${n > 1 ? 's' : ''}`;
  return weeklyMinutes == null ? jours : `${jours} · ${formatHours(weeklyMinutes)}/sem.`;
}

/** « Capteur, ceinture, HT » ; « Rien renseigné » si aucun matériel. */
export function equipmentSummary(eq: CareEquipment): string {
  const items = [eq.powerMeter && 'Capteur', eq.hrStrap && 'ceinture', eq.smartTrainer && 'HT', eq.poolAccess && 'piscine'].filter(Boolean);
  return items.length ? items.join(', ') : 'Rien renseigné';
}

/** Jour de repos ou exception couvrant `day`, pour le griser au calendrier. */
export function dayStatus(day: string, care: { days: CareDay[]; exceptions: CareException[] }): 'indisponible' | 'repos' | null {
  if (care.exceptions.some((e) => e.fromDay <= day && day <= e.toDay)) return 'indisponible';
  const d = care.days.find((x) => x.weekday === weekdayOf(day));
  return d && !d.available ? 'repos' : null;
}

/** Vrai si une séance peut tomber ce jour-là (ni repos, ni exception). */
export function isDayOpen(day: string, care: { days: CareDay[]; exceptions: CareException[] }): boolean {
  return dayStatus(day, care) == null;
}
