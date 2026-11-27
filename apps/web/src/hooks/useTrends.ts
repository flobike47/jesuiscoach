import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/services/api';
import { trendsApi } from '@/services/trendsApi';

/** Tendances. Le BFF lit sa copie en cache (30 min pour la forme, 10 min pour les sorties). */

export const trendKeys = {
  teamFitness: ['team-fitness'] as const,
  teamSports: ['team-sports'] as const,
  athleteSports: (athleteId: string | undefined) => ['athlete-sports', athleteId] as const,
};

/** Un 4xx (compte déconnecté, hors équipe) ne se corrige pas en relançant. */
const noRetryOn4xx = (count: number, err: Error) => {
  const status = err instanceof ApiError ? err.status : null;
  return (status == null || status >= 500) && count < 1;
};

export const useTeamFitness = () =>
  useQuery({ queryKey: trendKeys.teamFitness, queryFn: trendsApi.teamFitness, staleTime: 10 * 60_000 });

export const useTeamSports = () => useQuery({ queryKey: trendKeys.teamSports, queryFn: trendsApi.teamSports, staleTime: 5 * 60_000 });

export const useAthleteSports = (athleteId: string | undefined) =>
  useQuery({
    queryKey: trendKeys.athleteSports(athleteId),
    queryFn: () => trendsApi.athleteSports(athleteId!),
    enabled: Boolean(athleteId),
    staleTime: 5 * 60_000,
    retry: noRetryOn4xx,
  });
