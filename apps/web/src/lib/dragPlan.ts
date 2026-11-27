/**
 * Logique pure pour le glisser-déposer sur le planning d'équipe (grand écran).
 * Pas de React, testable indépendamment.
 */

import type { TeamCalendarAthlete } from '@/types';
import { dominantColor } from '@/lib/teamPlanning';

export interface WeekLoadData {
  before: number;
  after: number;
  pct: number;
}

/**
 * Calcule l'évolution de la charge semaine après ajout d'une séance.
 * @param athlete Athlète avec load.planned et days[]
 * @param weekIndex 0-6 (semaine 1) ou 7-13 (semaine 2)
 * @param addedLoad Charge de la séance à ajouter
 * @returns { before, after, pct : pourcentage d'augmentation }
 */
export function weekLoadAfter(
  athlete: TeamCalendarAthlete,
  weekIndex: number,
  addedLoad: number,
): WeekLoadData {
  const startIdx = weekIndex <= 6 ? 0 : 7;
  const endIdx = startIdx + 7;
  const daysInWeek = athlete.days.slice(startIdx, endIdx);

  // Somme des charges planifiées dans cette semaine
  const before = daysInWeek.reduce((sum, day) => {
    const dayLoad = day.workouts.reduce((s, w) => s + (w.load ?? 0), 0);
    return sum + dayLoad;
  }, 0);

  const after = before + addedLoad;
  const pct = before > 0 ? Math.round(((after - before) / before) * 100) : 0;

  return { before, after, pct };
}

/**
 * Vérifie s'il y a une séance intense (orange ou rouge) la veille d'une date donnée.
 * @param athlete Athlète avec days[]
 * @param date Date au format YYYY-MM-DD
 * @returns true si la veille a une séance orange/rouge
 */
export function intenseEve(athlete: TeamCalendarAthlete, date: string): boolean {
  const dateObj = new Date(date);
  if (dateObj.toString() === 'Invalid Date') return false;

  dateObj.setDate(dateObj.getDate() - 1);
  const prevDate = dateObj.toISOString().split('T')[0];

  const prevDay = athlete.days.find((d) => d.date === prevDate);
  if (!prevDay || prevDay.workouts.length === 0) return false;

  // Vérifier si la séance de la veille est orange/rouge
  // Utilise dominantColor qui retourne une couleur CSS variable
  const color = dominantColor(prevDay.workouts[0].description);
  return color === 'var(--orange)' || color === 'var(--red)';
}

/**
 * Vérifie si une case est libre et disponible (peut recevoir une séance).
 * @param athlete Athlète avec days[]
 * @param date Date au format YYYY-MM-DD
 * @returns true si la case est libre et non indisponible/repos
 */
export function canDrop(athlete: TeamCalendarAthlete, date: string): boolean {
  const day = athlete.days.find((d) => d.date === date);
  if (!day) return false;

  // Doit être sans séance, sans indisponibilité, sans repos prescrit
  const isFree = day.workouts.length === 0 && day.availability === null && !day.rest;
  return isFree;
}

/**
 * Génère le texte d'aperçu de dépose (nom athlète, jour, charge, avertissements).
 * @param athlete Athlète
 * @param date Date au format YYYY-MM-DD
 * @param addedLoad Charge de la séance à ajouter
 * @param weekIndex Semaine (0-6 ou 7-13)
 * @returns Texte HTML à afficher dans la bulle d'aperçu
 */
export interface DropPreview {
  /** « Hugo · mercredi 2 » */
  title: string;
  before: number;
  after: number;
  /** Hausse en % de la charge de la semaine. */
  pct: number;
  /** La semaine dépasserait la charge habituelle de plus de 15 %. */
  overload: boolean;
  /** Une séance intense la veille. */
  intenseEve: boolean;
}

/** Aperçu d'une dépose : données structurées, le composant les met en forme. */
export function dropPreview(athlete: TeamCalendarAthlete, date: string, addedLoad: number): DropPreview {
  const dayIndex = athlete.days.findIndex((d) => d.date === date);
  const { before, after, pct } = weekLoadAfter(athlete, Math.max(0, dayIndex), addedLoad);
  const d = new Date(`${date}T12:00:00Z`);
  const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
  const usual = athlete.load.usual;
  return {
    title: `${athlete.name} · ${day}`,
    before: Math.round(before),
    after: Math.round(after),
    pct,
    overload: usual != null && after > usual * 1.15,
    intenseEve: intenseEve(athlete, date),
  };
}
