import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/hooks/useCoach';
import type { AthleteOverview } from '@/types';

/**
 * Fiche profil : l'athlète consulte la sienne (/profil), le coach celle d'un
 * athlète de son équipe (/athletes/:id/profil). Les sous-pages reprennent la
 * même base d'URL.
 */
export function useProfileTarget(): {
  /** ID Intervals.icu de l'athlète affiché (undefined tant que /me charge). */
  athleteId: string | undefined;
  /** Base des liens : « /profil » ou « /athletes/i123/profil ». */
  base: string;
  /** true si l'utilisateur consulte sa propre fiche. */
  self: boolean;
  /** Retour de la fiche (page Profil). */
  back: { to: string; label: string };
} {
  const { id } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const athleteId = id ?? me.data?.athleteId;
  const self = !id || me.data?.athleteId === id;
  const base = id ? `/athletes/${encodeURIComponent(id)}/profil` : '/profil';

  let backLabel = 'Athlète';
  if (id) {
    const name = qc.getQueryData<AthleteOverview>(['athlete', id])?.summary.name;
    backLabel = name ?? 'Athlète';
  }

  const back = id ? { to: `/athletes/${encodeURIComponent(id)}`, label: backLabel } : { to: '/reglages', label: 'Réglages' };
  return { athleteId, base, self, back };
}
