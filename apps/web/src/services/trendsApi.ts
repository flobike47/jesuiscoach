import { get } from '@/services/api';
import type { AthleteFitness } from '@/lib/teamFitness';

/** Tendances de l'équipe (BFF : routes/trends.ts). Lues dans le cache du BFF. */

export interface TeamFitnessView {
  from: string;
  to: string;
  athletes: AthleteFitness[];
  errors: Array<{ id: string; error: string }>;
}

export const trendsApi = {
  teamFitness: () => get<TeamFitnessView>('/team/fitness'),
};
