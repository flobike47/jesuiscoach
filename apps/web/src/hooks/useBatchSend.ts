import { useMutation, useQueryClient } from '@tanstack/react-query';
import { batchApi } from '@/services/batchApi';

/**
 * Envoi groupé de séances (bloc dupliqué, séance récurrente). Le calendrier,
 * l'équipe et le planning d'équipe sont relus : ils montrent les séances créées.
 */
export function useApplyWorkouts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: batchApi.applyWorkouts,
    onSettled: () => {
      // Même en échec partiel, des séances ont pu être créées.
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['team-calendar'] });
    },
  });
}
