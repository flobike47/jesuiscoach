/** Formes des réponses du BFF (miroir de apps/bff/src/types.ts). */

export interface PublicStatus {
  demo: boolean;
  intervals: boolean;
}

export interface Me {
  role: 'coach' | 'athlete';
  name: string;
  athleteId: string;
  demo: boolean;
}

export interface Alert {
  level: 'high' | 'warn';
  code: 'fatigue' | 'ramp' | 'inactive' | 'missed';
  text: string;
}

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

export interface Activity {
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

export interface PlannedEvent {
  id?: number | string;
  category?: string;
  type?: string;
  start_date_local: string;
  name?: string;
  description?: string;
}

export interface SeriesPoint {
  date: string;
  fitness: number;
  fatigue: number;
  form: number;
}

export interface AthleteOverview {
  summary: AthleteSummary;
  series: SeriesPoint[];
  activities: Activity[];
}

export interface FeedItem {
  athleteId: string;
  athleteName: string;
  activity: Activity;
  plannedName: string | null;
}

export interface CalendarRange {
  events: PlannedEvent[];
  activities: Activity[];
}
