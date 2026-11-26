import { Spinner } from './PageLoader';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface PullIndicatorProps {
  pullPosition: number;
  isRefreshing: boolean;
  threshold?: number;
}

/**
 * Indicateur visuel pour le tirer-pour-actualiser.
 * Positionné fixe sous la barre de navigation, translate selon le tirage,
 * opacité proportionnelle, spinner tournant pendant le rafraîchissement.
 */
export function PullIndicator({ pullPosition, isRefreshing, threshold = 64 }: PullIndicatorProps) {
  const reducedMotion = usePrefersReducedMotion();

  // Opacité : 0 à seuil (croissante), puis stable; 1 pendant le rafraîchissement
  const opacity = isRefreshing ? 1 : Math.min(1, (pullPosition / threshold) * 1.2);

  // Position de translation (amortie en reduced-motion)
  const translateDistance = reducedMotion ? 0 : pullPosition;

  // Pendant le rafraîchissement, afficher le spinner fixe
  const displayPosition = isRefreshing ? threshold : translateDistance;

  return (
    <div
      style={{
        position: 'fixed',
        top: `calc(env(safe-area-inset-top, 0px) + 48px)`,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: 48,
        transform: `translateY(${displayPosition - threshold}px)`,
        opacity: pullPosition > 0 || isRefreshing ? opacity : 0,
        transition: isRefreshing ? 'none' : 'opacity 0.2s ease-out',
        pointerEvents: 'none',
        zIndex: 10,
      }}
      role="status"
      aria-label={isRefreshing ? 'Actualisation en cours' : 'Tirez pour actualiser'}
    >
      <Spinner size={24} />
    </div>
  );
}
