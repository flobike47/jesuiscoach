import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

/** Données du coach (via le BFF, jamais d'appel direct à Intervals.icu). */

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 5 * 60_000 });

export const useTeam = () => useQuery({ queryKey: ['team'], queryFn: api.team });

export const useFeed = () => useQuery({ queryKey: ['feed'], queryFn: api.feed });

export const useAthleteOverview = (id: string | undefined) =>
  useQuery({ queryKey: ['athlete', id], queryFn: () => api.athleteOverview(id!), enabled: Boolean(id) });

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
