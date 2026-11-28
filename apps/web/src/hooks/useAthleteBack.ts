import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useMe } from '@/hooks/useCoach';
import { readBack } from '@/lib/activityLink';
import type { AthleteOverview } from '@/types';

/**
 * Bouton retour des écrans d'analyse : vers « Progrès » pour un athlète
 * qui consulte ses propres données, vers la fiche de l'athlète pour le coach (nom lu dans le cache,
 * sans requête de plus). Un retour passé dans l'état de navigation (ex. depuis le calendrier) l'emporte.
 */
export function useAthleteBack(id: string | undefined): { to: string; label: string } {
  const me = useMe();
  const qc = useQueryClient();
  const from = readBack(useLocation().state);
  if (from) return from;
  // « Progrès » n'existe que pour l'athlète (en démo, le coach figure aussi dans l'équipe).
  if (!id || (me.data?.role === 'athlete' && me.data.athleteId === id)) return { to: '/progres', label: 'Progrès' };
  const name = qc.getQueryData<AthleteOverview>(['athlete', id])?.summary.name;
  return { to: `/athletes/${encodeURIComponent(id)}`, label: name ?? 'Athlète' };
}
