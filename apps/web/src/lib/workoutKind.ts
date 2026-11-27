/**
 * Détermine le type d'intensité d'une séance basé sur son bloc principal.
 * Utilise les mêmes seuils que parseQuick pour la cohérence.
 *
 * Types :
 *   - Récup : <= 60 %
 *   - Endurance : 61-75 %
 *   - Tempo : 76-87 %
 *   - Sweet spot : 88-93 %
 *   - Seuil : 94-109 %
 *   - VO2 : 110-125 %
 *   - Sprint : > 125 %
 */

import { parseWorkout } from './workout';

export type WorkoutKind = 'récup' | 'endurance' | 'tempo' | 'sweet spot' | 'seuil' | 'vo2' | 'sprint';

/**
 * Détermine le type d'intensité d'une séance.
 * Cherche le bloc avec l'intensité maximale (bloc principal).
 * @param description Texte de la séance au format Intervals.icu
 * @returns Le type d'intensité, ou 'endurance' par défaut
 */
export function workoutKind(description: string): WorkoutKind {
  const steps = parseWorkout(description);
  if (steps.length === 0) return 'endurance';

  // Trouve le bloc avec l'intensité maximale
  let maxIntensity = 0;
  for (const step of steps) {
    // Utilise la cible maximale du bloc (soit "to" si c'est une rampe, soit "from"/"to" selon le palier)
    const intensity = Math.max(step.from, step.to);
    maxIntensity = Math.max(maxIntensity, intensity);
  }

  // Détermine le type basé sur l'intensité maximale
  if (maxIntensity <= 60) return 'récup';
  if (maxIntensity <= 75) return 'endurance';
  if (maxIntensity <= 87) return 'tempo';
  if (maxIntensity <= 93) return 'sweet spot';
  if (maxIntensity <= 109) return 'seuil';
  if (maxIntensity <= 125) return 'vo2';
  return 'sprint';
}

/** Couleur à afficher pour un type de séance */
export function kindColor(kind: WorkoutKind): string {
  const colors: Record<WorkoutKind, string> = {
    récup: 'var(--label-2)',
    endurance: 'var(--blue)',
    tempo: 'var(--orange)',
    'sweet spot': 'var(--orange)',
    seuil: 'var(--orange)',
    vo2: 'var(--red)',
    sprint: 'var(--red)',
  };
  return colors[kind];
}

/** Libellé d'affichage pour un type de séance */
export function kindLabel(kind: WorkoutKind): string {
  const labels: Record<WorkoutKind, string> = {
    récup: 'Récup',
    endurance: 'Endurance',
    tempo: 'Tempo',
    'sweet spot': 'Sweet spot',
    seuil: 'Seuil',
    vo2: 'VO2',
    sprint: 'Sprint',
  };
  return labels[kind];
}
