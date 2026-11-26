/**
 * Logique de tirer pour actualiser (pull-to-refresh) : calcul de la résistance
 * et détection du seuil de déclenchement.
 */

const THRESHOLD = 64; // pixels
const RESISTANCE = 0.4; // facteur de résistance progressive

/** Calcule la position du tirer basée sur la position du doigt (avec résistance). */
export function resistantPull(dragDistance: number): number {
  if (dragDistance <= 0) return 0;
  // Résistance progressive : plus on tire, moins c'est facile
  const resisted = dragDistance * Math.pow(RESISTANCE, Math.min(1, dragDistance / 200));
  return Math.max(0, resisted);
}

/** Détermine si le seuil de déclenchement est atteint. */
export function isPullTriggered(pullPosition: number): boolean {
  return pullPosition >= THRESHOLD;
}

/** Vérifie si on est en haut de page (peut débuter un tirer). */
export function isAtPageTop(element: HTMLElement | null): boolean {
  if (!element) return false;
  return element.scrollTop <= 0;
}
