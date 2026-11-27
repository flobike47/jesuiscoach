import { del, get, post, put } from './api';
import type { Sport } from '@/lib/workout';

/**
 * Fiche « soin » de l'athlète : semaine type, volume, matériel, exceptions,
 * blessures, et avertissements à l'envoi d'une séance. Rien n'est envoyé à
 * Intervals.icu (sauf la séance elle-même, via POST /workouts).
 */

export type Slot = 'any' | 'morning' | 'noon' | 'evening';
export type Place = 'any' | 'outdoor' | 'indoor';

export interface CareDay {
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  available: boolean;
  maxMinutes: number | null;
  slot: Slot;
  place: Place;
}

export interface CareException {
  id: string;
  fromDay: string;
  toDay: string;
  note: string | null;
}

export interface CareEquipment {
  powerMeter: boolean;
  hrStrap: boolean;
  smartTrainer: boolean;
  poolAccess: boolean;
}

export interface CareInjury {
  id: string;
  title: string;
  startedOn: string;
  expectedEnd: string | null;
  endedOn: string | null;
  avoidSports: Sport[];
  avoidIntensity: boolean;
  note: string | null;
}

export interface CareView {
  weeklyMinutes: number | null;
  days: CareDay[];
  exceptions: CareException[];
  equipment: CareEquipment;
  injuries: { current: CareInjury[]; past: CareInjury[] };
  updatedBy: 'athlete' | 'coach';
  updatedAt: string | null;
}

export type CareInjuryInput = Omit<CareInjury, 'id'>;

export interface CareWarning {
  kind: 'injury' | 'availability' | 'exception' | 'equipment';
  /** block : envoi bloqué sans confirmation ; warn : avertissement. */
  level: 'block' | 'warn';
  title: string;
  detail: string;
  /** Jour conseillé (durée trop longue pour le jour choisi). */
  suggestDate?: string;
}

export interface WorkoutCheckInput {
  athleteIds: string[];
  date: string;
  sport: Sport;
  durationSec: number | null;
  usesPower: boolean;
  highIntensity: boolean;
}

export interface WorkoutSendInput extends WorkoutCheckInput {
  name: string;
  description: string;
  /** Athlètes pour lesquels l'envoi malgré un blocage est confirmé. */
  force: string[];
  /** Prévenir les athlètes servis par une notification. */
  notify?: boolean;
}

export interface WorkoutSendResult {
  results: Array<{ id: string; ok: boolean; blocked?: boolean; error?: string }>;
  /** Athlètes effectivement notifiés. */
  notified?: number;
}

export interface AssignSuggestInput {
  description: string;
  sport: Sport;
  athleteIds: string[];
  from: string;
  to: string;
}

export interface AssignSuggestion {
  athleteId: string;
  name: string;
  date: string | null;
  variant: 'courte' | 'standard' | 'longue';
  intensityScale: number;
  reasons: string[];
  alternatives: string[];
  replaces: { eventId: string; name: string } | null;
  blocked: string | null;
}

export interface AssignSuggestResult {
  suggestions: AssignSuggestion[];
}

const enc = encodeURIComponent;

export const careApi = {
  care: (athleteId: string) => get<CareView>(`/athletes/${enc(athleteId)}/care`),
  saveAvailability: (athleteId: string, body: { weeklyMinutes: number | null; days: CareDay[] }) =>
    put<{ ok: true }>(`/athletes/${enc(athleteId)}/care/availability`, body),
  saveEquipment: (athleteId: string, body: CareEquipment) => put<{ ok: true }>(`/athletes/${enc(athleteId)}/care/equipment`, body),
  addException: (athleteId: string, body: Omit<CareException, 'id'>) => post<CareException>(`/athletes/${enc(athleteId)}/care/exceptions`, body),
  deleteException: (athleteId: string, id: string) => del<{ ok: true }>(`/athletes/${enc(athleteId)}/care/exceptions/${enc(id)}`),
  addInjury: (athleteId: string, body: CareInjuryInput) => post<CareInjury>(`/athletes/${enc(athleteId)}/care/injuries`, body),
  updateInjury: (athleteId: string, id: string, body: CareInjuryInput) => put<CareInjury>(`/athletes/${enc(athleteId)}/care/injuries/${enc(id)}`, body),
  deleteInjury: (athleteId: string, id: string) => del<{ ok: true }>(`/athletes/${enc(athleteId)}/care/injuries/${enc(id)}`),
  checkWorkout: (body: WorkoutCheckInput) => post<{ results: Array<{ id: string; warnings: CareWarning[] }> }>('/workouts/check', body),
  assignSuggest: (body: AssignSuggestInput) => post<AssignSuggestResult>('/assign/suggest', body),
  sendWorkout: (body: WorkoutSendInput) => post<WorkoutSendResult>('/workouts', body),
};
