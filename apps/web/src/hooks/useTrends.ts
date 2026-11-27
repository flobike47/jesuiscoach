import { useQuery } from '@tanstack/react-query';
import { trendsApi } from '@/services/trendsApi';

/** Tendances de l'équipe. Le BFF lit sa copie en cache (30 min pour la forme). */

export const trendKeys = {
  teamFitness: ['team-fitness'] as const,
};

export const useTeamFitness = () =>
  useQuery({ queryKey: trendKeys.teamFitness, queryFn: trendsApi.teamFitness, staleTime: 10 * 60_000 });
