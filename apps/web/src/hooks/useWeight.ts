import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/services/api';
import { weightApi } from '@/services/weightApi';

/**
 * Courbe du poids. Un 403 n'est pas une panne : le coach n'a pas l'accord de
 * l'athlète. On ne retente donc pas les 4xx (le BFF refuse à chaque fois).
 */

export const weightKeys = {
  curve: (athleteId: string | undefined) => ['weight', athleteId] as const,
  sharing: ['weight-sharing'] as const,
};

const retry = (count: number, err: Error) => {
  const status = err instanceof ApiError ? err.status : null;
  return (status == null || status >= 500) && count < 1;
};

/** Le BFF garde l'historique 6 h ; une pesée vide son cache (et le nôtre, voir useProfile). */
export const useWeight = (athleteId: string | undefined) =>
  useQuery({
    queryKey: weightKeys.curve(athleteId),
    queryFn: () => weightApi.weight(athleteId!),
    enabled: Boolean(athleteId),
    staleTime: 10 * 60_000,
    retry,
  });

/** Vrai quand le BFF refuse la courbe faute d'accord de l'athlète. */
export const isNotShared = (err: unknown): boolean => err instanceof ApiError && err.status === 403;

export const useWeightSharing = (enabled = true) =>
  useQuery({ queryKey: weightKeys.sharing, queryFn: weightApi.sharing, enabled, retry });

export function useSetWeightSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: weightApi.setSharing,
    onSuccess: (data) => {
      qc.setQueryData(weightKeys.sharing, data);
      qc.invalidateQueries({ queryKey: ['weight'] });
    },
  });
}
