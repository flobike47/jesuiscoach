import { useEffect, useRef, useState } from 'react';
import { resistantPull, isPullTriggered } from '@/lib/pull';

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
}

/**
 * « Tirer pour actualiser » sur le défilement de la fenêtre : le geste ne
 * démarre qu'en haut de page, hors feuille modale, et ne bloque le défilement
 * natif (preventDefault) que pendant un tirage effectif vers le bas.
 * L'indicateur (PullIndicator) gère lui-même le mouvement réduit.
 */
export function usePullToRefresh({ onRefresh }: UsePullToRefreshOptions) {
  const [pullPosition, setPullPosition] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Refs : les écouteurs restent les mêmes pendant tout le geste.
  const onRefreshRef = useRef(onRefresh);
  const positionRef = useRef(0);
  const refreshingRef = useRef(false);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const setPosition = (p: number) => {
      positionRef.current = p;
      setPullPosition(p);
    };

    const onStart = (e: TouchEvent) => {
      // Une feuille ouverte (dialog) garde son propre geste et son défilement.
      const inDialog = e.target instanceof Element && e.target.closest('[role="dialog"]');
      startYRef.current = !refreshingRef.current && !inDialog && window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null;
    };

    const onMove = (e: TouchEvent) => {
      if (startYRef.current == null) return;
      const drag = (e.touches[0]?.clientY ?? 0) - startYRef.current;
      if (drag <= 0 || window.scrollY > 0) {
        if (positionRef.current) setPosition(0);
        return;
      }
      e.preventDefault();
      setPosition(resistantPull(drag));
    };

    const onEnd = async () => {
      if (startYRef.current == null) return;
      startYRef.current = null;
      if (!isPullTriggered(positionRef.current)) return setPosition(0);
      refreshingRef.current = true;
      setIsRefreshing(true);
      try {
        await onRefreshRef.current();
      } finally {
        refreshingRef.current = false;
        setIsRefreshing(false);
        setPosition(0);
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return { pullPosition, isRefreshing };
}
