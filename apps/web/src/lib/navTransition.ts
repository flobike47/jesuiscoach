/**
 * Sens de la prochaine transition d'écran (View Transitions, styles.css) :
 * « forward » glisse depuis la droite, « back » vers la droite, « tab »
 * fond-enchaîné entre onglets. Posé sur <html> juste avant la navigation.
 */
export type NavDirection = 'forward' | 'back' | 'tab';

export function setNavDirection(direction: NavDirection): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.nav = direction;
}
