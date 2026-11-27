import { get, put } from '@/services/api';
import type { WeightPoint } from '@/lib/weightTrend';

/** Évolution du poids et partage avec le coach (BFF : routes/weight.ts). */

export interface WeightView {
  points: WeightPoint[];
  /** Profondeur de l'historique lu (jours). */
  days: number;
}

export interface SharingView {
  weightToCoach: boolean;
  /** Date de l'accord (ISO) ; null = non partagé. */
  weightSince: string | null;
}

export const weightApi = {
  weight: (athleteId: string) => get<WeightView>(`/athletes/${encodeURIComponent(athleteId)}/weight`),
  sharing: () => get<SharingView>('/me/sharing'),
  setSharing: (weightToCoach: boolean) => put<SharingView>('/me/sharing', { weightToCoach }),
};
