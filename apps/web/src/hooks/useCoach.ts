import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

/** Données du coach (via le BFF, jamais d'appel direct à Intervals.icu). */

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 5 * 60_000 });

export const useTeam = (enabled = true) => useQuery({ queryKey: ['team'], queryFn: api.team, enabled });

export const useFeed = () => useQuery({ queryKey: ['feed'], queryFn: api.feed });

export const useAthleteOverview = (id: string | undefined) =>
  useQuery({ queryKey: ['athlete', id], queryFn: () => api.athleteOverview(id!), enabled: Boolean(id) });

/** Tableaux de bord avancés : données lentes à changer, gardées 10 min. */
export const usePower = (id: string | undefined) =>
  useQuery({ queryKey: ['power', id], queryFn: () => api.power(id!), enabled: Boolean(id), staleTime: 10 * 60_000 });

export const useZones = (id: string | undefined) =>
  useQuery({ queryKey: ['zones', id], queryFn: () => api.zones(id!), enabled: Boolean(id), staleTime: 10 * 60_000 });

/** Une sortie terminée ne change plus : pas de relecture automatique. */
export const useActivityDetail = (id: string | undefined, activityId: string | undefined) =>
  useQuery({
    queryKey: ['activity', id, activityId],
    queryFn: () => api.activity(id!, activityId!),
    enabled: Boolean(id && activityId),
    staleTime: Infinity,
  });

export const useCalendar = (id: string | undefined, from: string, to: string) =>
  useQuery({ queryKey: ['calendar', id, from, to], queryFn: () => api.calendar(id!, from, to), enabled: Boolean(id) });

export function useAssignWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.assignWorkout,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

/** Déplacer / supprimer une séance prévue : le calendrier et l'équipe sont relus. */
export function useEditEvent() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['calendar'] });
    qc.invalidateQueries({ queryKey: ['team'] });
  };
  const move = useMutation({
    mutationFn: (v: { athleteId: string; eventId: string; date: string }) => api.moveEvent(v.athleteId, v.eventId, v.date),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (v: { athleteId: string; eventId: string }) => api.deleteEvent(v.athleteId, v.eventId),
    onSuccess: refresh,
  });
  return { move, remove };
}

/* ---------- Parcours athlète ---------- */

export const useToday = () => useQuery({ queryKey: ['today'], queryFn: api.today });

export function useSaveCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.saveCheckin,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today'] }),
  });
}
