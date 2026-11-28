import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { activityPath, backState } from '@/lib/activityLink';

/**
 * Lien vers la fiche d'une sortie qui revient à l'écran courant (« Calendrier » par défaut),
 * vue et athlète compris puisqu'ils sont dans l'URL.
 */
export function useActivityLink(label = 'Calendrier') {
  const location = useLocation();
  return useCallback(
    (athleteId: string, activityId: string) => ({ to: activityPath(athleteId, activityId), state: backState(location, label) }),
    [location, label],
  );
}
