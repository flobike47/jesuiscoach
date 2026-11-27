import { get } from '@/services/api';
import type { AthleteFitness } from '@/lib/teamFitness';
import type { SportTime } from '@/lib/sportShare';

/** Tendances de l'équipe (BFF : routes/trends.ts). Lues dans le cache du BFF. */

export interface TeamFitnessView {
  from: string;
  to: string;
  athletes: AthleteFitness[];
  errors: Array<{ id: string; error: string }>;
}

/** Temps par sport sur 4 semaines (du `from` au `to` inclus). */
export interface TeamSportsView {
  from: string;
  to: string;
  team: SportTime;
  athletes: Array<{ id: string; name: string; time: SportTime }>;
  errors: Array<{ id: string; error: string }>;
}

export interface AthleteSportsView {
  from: string;
  to: string;
  time: SportTime;
}

export const trendsApi = {
  teamFitness: () => get<TeamFitnessView>('/team/fitness'),
  teamSports: () => get<TeamSportsView>('/team/sports'),
  athleteSports: (athleteId: string) => get<AthleteSportsView>(`/athletes/${encodeURIComponent(athleteId)}/sports`),
};
