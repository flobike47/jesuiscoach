/**
 * Interprétation de la forme (fitness − fatigue, Intervals.icu).
 * 5 zones : surcharge, productif, neutre, frais, désentraînement.
 */

export interface FormZone {
  key: 'risk' | 'productive' | 'neutral' | 'fresh' | 'transition';
  label: string;
  athleteLabel: string;
  advice: string;
  color: string;
}

/**
 * Détermine la zone de forme d'après le score (fitness − fatigue).
 * Seuils d'Intervals.icu : < −30 risk ; −30…−10 productive ; −10…5 neutral ; 5…25 fresh ; > 25 transition.
 */
/**
 * Calcule la position du curseur sur la jauge de forme (−50…+40).
 * Les 5 segments ont des largeurs proportionnelles 1.2, 1.6, 1, 1.3, 0.9.
 * Retourne un pourcentage (0…100).
 */
export function gaugePosition(form: number): number {
  const proportions = [1.2, 1.6, 1, 1.3, 0.9];
  const boundaries = [-50, -30, -10, 5, 25, 40];
  const normalizedForm = Math.max(-50, Math.min(40, form));
  const totalWidth = proportions.reduce((a, b) => a + b, 0);

  // Trouver le segment contenant form
  let segmentIndex = proportions.length - 1; // Par défaut, dernier segment
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (normalizedForm >= boundaries[i] && normalizedForm <= boundaries[i + 1]) {
      segmentIndex = i;
      break;
    }
  }

  // Calculer la position relative dans le segment
  const segmentStart = boundaries[segmentIndex];
  const segmentEnd = boundaries[segmentIndex + 1];
  const segmentRange = segmentEnd - segmentStart;
  const positionInSegment = segmentRange > 0 ? (normalizedForm - segmentStart) / segmentRange : 1; // 0…1

  // Calculer la largeur cumulée jusqu'au début de ce segment
  const cumulativeWidth = proportions.slice(0, segmentIndex).reduce((a, b) => a + b, 0);
  const segmentWidth = proportions[segmentIndex];

  // Position finale en pourcentage
  const position = ((cumulativeWidth + positionInSegment * segmentWidth) / totalWidth) * 100;
  return Math.round(position * 1000) / 1000; // Éviter les erreurs d'arrondi à virgule flottante
}

export function formZone(form: number): FormZone {
  if (form < -30) {
    return {
      key: 'risk',
      label: 'Surcharge',
      athleteLabel: 'Très fatigué·e',
      advice: 'Deux jours faciles avant le prochain effort intense.',
      color: 'var(--red)',
    };
  }
  if (form < -10) {
    return {
      key: 'productive',
      label: 'Productif',
      athleteLabel: 'En progression',
      advice: 'Tu encaisses bien la charge. Garde les sorties faciles vraiment faciles.',
      color: 'var(--green)',
    };
  }
  if (form < 5) {
    return {
      key: 'neutral',
      label: 'Neutre',
      athleteLabel: 'Stable',
      advice: 'Ni fatigue ni fraîcheur : bon moment pour une séance clé.',
      color: 'var(--gray)',
    };
  }
  if (form < 25) {
    return {
      key: 'fresh',
      label: 'Frais',
      athleteLabel: 'Frais',
      advice: 'Tu es reposé·e : idéal avant une course.',
      color: 'var(--blue)',
    };
  }
  return {
    key: 'transition',
    label: 'Désentraînement',
    athleteLabel: 'Très reposé·e',
    advice: 'La forme baisse faute de charge : reprendre progressivement.',
    color: 'var(--yellow)',
  };
}
