import { del, get, post, put } from '@/services/api';
import type { PlannedEvent, Sport, Group, TeamCalendar } from '@/types';

/**
 * Calendrier stocké dans l'app (phase C) : séances, compétitions, notes,
 * objectifs et vue « Aujourd'hui » du coach. Le BFF renvoie les événements
 * avec des champs en plus de ceux d'Intervals.icu (voir docs/plans/C-calendrier.md).
 */

/** `rest` : repos prescrit par le coach (NOTE chez Intervals.icu). */
export type EventKind = 'workout' | 'race' | 'note' | 'rest';
export type RacePriority = 'A' | 'B' | 'C';
export type SyncStatus = 'pending' | 'synced' | 'error';

/** Événement du calendrier : forme Intervals.icu + champs de l'app. */
export interface AppEvent extends PlannedEvent {
  /** Identifiant de la ligne dans l'app (uuid). */
  appId?: string;
  kind?: EventKind;
  racePriority?: RacePriority | null;
  raceDistanceM?: number | null;
  raceGoal?: string | null;
  origin?: 'app' | 'intervals';
  syncStatus?: SyncStatus;
  syncError?: string | null;
}

export interface EventInput {
  kind: EventKind;
  date: string;
  name: string;
  description?: string | null;
  sport?: Sport | null;
  racePriority?: RacePriority | null;
  raceDistanceM?: number | null;
  raceGoal?: string | null;
}

export type EventPatch = Partial<Omit<EventInput, 'kind'>>;

export type DayStatus = 'done' | 'planned' | 'missed' | 'rest' | 'extra';

export interface TeamDayAthlete {
  id: string;
  name: string;
  status: DayStatus | null;
  planned: AppEvent[];
  done: Array<{ id: string; name: string | null; type: string | null; moving_time: number | null; icu_training_load: number | null }>;
  error?: string;
}

export interface Race {
  id: string;
  name: string;
  date: string;
  racePriority: RacePriority;
  raceDistanceM: number | null;
  raceGoal: string | null;
  syncStatus: SyncStatus;
}

export type GoalMetric = 'ftp' | 'weight' | 'run_threshold' | 'swim_threshold' | 'vma' | 'weekly_hours' | 'other';

export interface Goal {
  id: string;
  title: string;
  metric: GoalMetric | null;
  targetValue: number | null;
  dueDay: string | null;
  raceId: string | null;
  achievedOn: string | null;
  note: string | null;
  createdBy: 'athlete' | 'coach';
  updatedAt: string;
}

export type GoalInput = Partial<Omit<Goal, 'id' | 'createdBy' | 'updatedAt'>> & { title?: string };

const base = (athleteId: string) => `/athletes/${encodeURIComponent(athleteId)}`;
const ev = (athleteId: string, eventId: string) => `${base(athleteId)}/events/${encodeURIComponent(eventId)}`;

export const calendarApi = {
  createEvent: (athleteId: string, body: EventInput) => post<{ event: AppEvent }>(`${base(athleteId)}/events`, body),
  updateEvent: (athleteId: string, eventId: string, body: EventPatch) => put<{ event: AppEvent }>(ev(athleteId, eventId), body),
  deleteEvent: (athleteId: string, eventId: string) => del<{ ok: boolean; error?: string }>(ev(athleteId, eventId)),
  resyncEvent: (athleteId: string, eventId: string) => post<{ event: AppEvent }>(`${ev(athleteId, eventId)}/resync`, {}),

  teamToday: (date: string) => get<{ date: string; athletes: TeamDayAthlete[] }>('/team/today', { date }),

  goals: (athleteId: string) => get<{ races: Race[]; goals: Goal[] }>(`${base(athleteId)}/goals`),
  createGoal: (athleteId: string, body: GoalInput & { title: string }) => post<Goal>(`${base(athleteId)}/goals`, body),
  updateGoal: (athleteId: string, goalId: string, body: GoalInput) => put<Goal>(`${base(athleteId)}/goals/${encodeURIComponent(goalId)}`, body),
  deleteGoal: (athleteId: string, goalId: string) => del<{ ok: true }>(`${base(athleteId)}/goals/${encodeURIComponent(goalId)}`),

  teamCalendar: (from: string, to: string) => get<TeamCalendar>('/team/calendar', { from, to }),
  groups: () => get<{ groups: Group[] }>('/groups'),
  createGroup: (body: { name: string; athleteIds: string[] }) => post<{ group: Group }>('/groups', body),
  updateGroup: (id: string, body: { name?: string; athleteIds?: string[] }) => put<{ group: Group }>(`/groups/${encodeURIComponent(id)}`, body),
  deleteGroup: (id: string) => del<{ ok: true }>(`/groups/${encodeURIComponent(id)}`),
};
