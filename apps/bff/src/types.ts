/** Sous-ensemble des réponses Intervals.icu utilisé par l'app (champs à confirmer au spike API). */

export interface IntervalsAthlete {
  id: string;
  name?: string;
  sportSettings?: Array<{ types?: string[]; ftp?: number | null }>;
  icu_ftp?: number | null;
}

export interface IntervalsWellness {
  /** Date au format YYYY-MM-DD. */
  id: string;
  ctl?: number | null;
  atl?: number | null;
  rampRate?: number | null;
  hrv?: number | null;
  restingHR?: number | null;
}

export interface IntervalsActivity {
  id: string;
  start_date_local: string;
  type?: string;
  name?: string;
  moving_time?: number | null;
  distance?: number | null;
  icu_training_load?: number | null;
  icu_weighted_avg_watts?: number | null;
  icu_intensity?: number | null;
  average_heartrate?: number | null;
}

export interface IntervalsEvent {
  id?: number | string;
  category?: string;
  type?: string;
  start_date_local: string;
  name?: string;
  description?: string;
}

export interface NewWorkoutEvent {
  date: string;
  name: string;
  description: string;
}

export type AlertLevel = 'high' | 'warn';
export interface Alert {
  level: AlertLevel;
  code: 'fatigue' | 'ramp' | 'inactive' | 'missed';
  text: string;
}

/** Ligne du tableau « Équipe ». */
export interface AthleteSummary {
  id: string;
  name: string;
  ftp: number | null;
  fitness: number;
  fatigue: number;
  form: number;
  ramp: number | null;
  weekLoad: number;
  weekHours: number;
  weekKm: number;
  lastRide: string | null;
  daysSinceRide: number | null;
  plannedDone: number;
  plannedTotal: number;
  alerts: Alert[];
}
