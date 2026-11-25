import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/hooks/useCoach';
import type { AthleteOverview } from '@/types';

/**
 * Bouton retour des écrans d'analyse : vers « Progrès » pour un athlète
 * qui consulte ses propres données, vers la fiche de l'athlète pour le coach (nom lu dans le cache,
 * sans requête de plus).
 */
export function useAthleteBack(id: string | undefined): { to: string; label: string } {
  const me = useMe();
  const qc = useQueryClient();
  // « Progrès » n'existe que pour l'athlète (en démo, le coach figure aussi dans l'équipe).
  if (!id || (me.data?.role === 'athlete' && me.data.athleteId === id)) return { to: '/progres', label: 'Progrès' };
  const name = qc.getQueryData<AthleteOverview>(['athlete', id])?.summary.name;
  return { to: `/athletes/${encodeURIComponent(id)}`, label: name ?? 'Athlète' };
}
