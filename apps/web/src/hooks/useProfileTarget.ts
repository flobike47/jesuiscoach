import { useParams } from 'react-router-dom';
import { useMe } from '@/hooks/useCoach';

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
  const athleteId = id ?? me.data?.athleteId;
  const self = !id || me.data?.athleteId === id;
  const base = id ? `/athletes/${encodeURIComponent(id)}/profil` : '/profil';
  const back = id ? { to: `/athletes/${encodeURIComponent(id)}`, label: 'Athlète' } : { to: '/reglages', label: 'Réglages' };
  return { athleteId, base, self, back };
}
