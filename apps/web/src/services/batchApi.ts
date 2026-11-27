import { BATCH_TIMEOUT_MS, post } from '@/services/api';
import type { ApplyPlanResult, PlanWorkout } from '@/types';

/**
 * Envoi groupé sans plan enregistré (bloc dupliqué, séance récurrente) :
 * mêmes bornes, même quota et même rapport que l'application d'un plan.
 */
export const batchApi = {
  applyWorkouts: (body: { workouts: PlanWorkout[]; athleteIds: string[]; startDate: string }) =>
    post<ApplyPlanResult>('/plans/apply', body, { timeout: BATCH_TIMEOUT_MS }),
};
