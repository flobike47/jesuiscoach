import { get } from '@/services/api';
import type { AthleteFitness } from '@/lib/teamFitness';
import type { SportCount } from '@/lib/sportShare';

/** Tendances de l'équipe (BFF : routes/trends.ts). Lues dans le cache du BFF. */

export interface TeamFitnessView {
  from: string;
  to: string;
  athletes: AthleteFitness[];
  errors: Array<{ id: string; error: string }>;
}

/** Nombre de sorties par sport sur 4 semaines (du `from` au `to` inclus). */
export interface TeamSportsView {
  from: string;
  to: string;
  team: SportCount;
  athletes: Array<{ id: string; name: string; count: SportCount }>;
  errors: Array<{ id: string; error: string }>;
}

export interface AthleteSportsView {
  from: string;
  to: string;
  count: SportCount;
}

export const trendsApi = {
  teamFitness: () => get<TeamFitnessView>('/team/fitness'),
  teamSports: () => get<TeamSportsView>('/team/sports'),
  athleteSports: (athleteId: string) => get<AthleteSportsView>(`/athletes/${encodeURIComponent(athleteId)}/sports`),
};
