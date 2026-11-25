import { del, get, post, put } from '@/services/api';
import type { Sport } from '@/types';

/** Fiche profil (BFF : routes/profile.ts). Les valeurs physiologiques partent vers Intervals.icu. */

export type Sex = 'M' | 'F';

export interface IdentityValues {
  /** AAAA-MM-JJ */
  birthDate: string | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  restingHr: number | null;
}

export interface PhysioValues {
  ftp: number | null;
  lthr: number | null;
  maxHr: number | null;
  /** Course : s/km ; natation : s/100 m ; vélo : null. */
  thresholdSecs: number | null;
}

export type SuggestionField = 'ftp' | 'lthr' | 'maxHr' | 'thresholdSecs' | 'birthDate' | 'sex' | 'heightCm' | 'weightKg' | 'restingHr';

/** Valeur d'Intervals.icu différente de celle de l'app. */
export interface Suggestion {
  sport: Sport | null;
  field: SuggestionField;
  appValue: number | string | null;
  intervalsValue: number | string;
}

export interface ProfileView {
  identity: IdentityValues;
  physiology: Record<Sport, PhysioValues>;
  vmaKmh: number | null;
  /** Valeurs actuelles d'Intervals.icu ; null si indisponibles. */
  intervals: (Record<Sport, PhysioValues> & IdentityValues) | null;
  suggestions: Suggestion[];
  sync: { syncedAt: string | null; error: string | null; needsReconnect: boolean };
  updatedBy: 'athlete' | 'coach' | 'intervals';
  updatedAt: string;
}

export type TestKind = 'ftp' | 'lthr' | 'vma' | 'run_threshold' | 'swim_threshold' | 'other';

export interface ProfileTest {
  id: string;
  day: string;
  kind: TestKind;
  value: number;
  note: string | null;
  createdAt: string;
}

const enc = encodeURIComponent;

export const profileApi = {
  get: (athleteId: string) => get<ProfileView>(`/athletes/${enc(athleteId)}/profile`),
  saveIdentity: (athleteId: string, body: Partial<IdentityValues>) => put<ProfileView>(`/athletes/${enc(athleteId)}/profile/identity`, body),
  savePhysiology: (athleteId: string, sport: Sport, body: Partial<PhysioValues>) =>
    put<ProfileView>(`/athletes/${enc(athleteId)}/profile/physiology/${sport}`, body),
  saveVma: (athleteId: string, vmaKmh: number | null) => put<ProfileView>(`/athletes/${enc(athleteId)}/profile/vma`, { vmaKmh }),
  acceptSuggestion: (athleteId: string, sport: Sport | null, field: SuggestionField) =>
    post<ProfileView>(`/athletes/${enc(athleteId)}/profile/suggestions/accept`, { sport, field }),
  tests: (athleteId: string) => get<{ tests: ProfileTest[]; max: number }>(`/athletes/${enc(athleteId)}/profile/tests`),
  addTest: (athleteId: string, body: { day: string; kind: TestKind; value: number; note?: string | null; apply?: boolean }) =>
    post<{ test: ProfileTest }>(`/athletes/${enc(athleteId)}/profile/tests`, body),
  deleteTest: (athleteId: string, testId: string) => del<{ ok: true }>(`/athletes/${enc(athleteId)}/profile/tests/${enc(testId)}`),
};
