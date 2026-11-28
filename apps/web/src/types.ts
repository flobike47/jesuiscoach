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

/** Réglages de connexion Intervals.icu (« Bien démarrer ») ; null = non lisible. */
export interface DeviceLink {
  provider: 'garmin' | 'coros' | 'wahoo' | 'suunto';
  label: string;
  sync: boolean | null;
  uploadWorkouts: boolean | null;
}

export interface SetupStatus {
  devices: DeviceLink[];
  deviceSync: boolean | null;
  uploadWorkouts: boolean | null;
  stravaLinked: boolean | null;
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

export interface Checkin {
  day: string;
  /** 1 = très mal … 5 = en pleine forme */
  feeling: number;
  rpe: number | null;
  note: string | null;
}

export interface AthleteOverview {
  summary: AthleteSummary;
  series: SeriesPoint[];
  activities: Activity[];
  checkins: Checkin[];
}

export interface TodayView {
  today: string;
  name: string;
  ftp: number | null;
  workouts: PlannedEvent[];
  activitiesToday: Activity[];
  doneEventIds: string[];
  tomorrow: PlannedEvent[];
  week: Array<{ date: string; planned: string[]; load: number; done: boolean }>;
  form: { fitness: number; fatigue: number; form: number };
  checkin: Checkin | null;
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
  /** Séances réalisées (appariées par Intervals.icu, sinon sortie du même jour). */
  doneEventIds: string[];
  /** Séance réalisée → sortie qui la réalise. Facultatif : absent d'un BFF plus ancien. */
  activityByEvent?: Record<string, string>;
}

/* ---------- Tableaux de bord avancés (BFF : lib/dashboards.ts) ---------- */

export type CurveRange = '90d' | '1y';

export interface CurvePoint {
  secs: number;
  watts: number;
}

export interface PowerRecord {
  secs: number;
  watts: number;
  wkg: number | null;
  activityId: string | null;
  activityName: string | null;
  date: string | null;
  /** Record de l'année établi dans les 90 derniers jours. */
  yearBest: boolean;
}

export interface PowerModel {
  ftp: number | null;
  cp: number | null;
  wPrime: number | null;
  pMax: number | null;
}

export interface PowerView {
  ftp: number | null;
  curves: Record<CurveRange, CurvePoint[]>;
  records: Record<CurveRange, PowerRecord[]>;
  models: Record<CurveRange, PowerModel | null>;
}

export interface ZoneRange {
  name: string;
  from: number;
  to: number | null;
}

export interface ZonesWeek {
  week: string;
  power: number[];
  hr: number[];
  movingTime: number;
}

export interface ZonesView {
  weeks: ZonesWeek[];
  ftp: number | null;
  powerZones: ZoneRange[];
  hrZones: ZoneRange[];
  sweetSpot: { from: number; to: number } | null;
  ridesWithPower: number;
  ridesWithHr: number;
  rides: number;
}

export interface ActivityStreams {
  step: number;
  time: number[];
  watts: Array<number | null> | null;
  heartrate: Array<number | null> | null;
}

export interface IntervalView {
  label: string;
  start: number;
  end: number;
  duration: number;
  watts: number | null;
  weightedWatts: number | null;
  heartrate: number | null;
  cadence: number | null;
  zone: number | null;
}

export interface ActivityView {
  activity: {
    id: string;
    name: string;
    date: string;
    type: string | null;
    movingTime: number | null;
    distance: number | null;
    elevation: number | null;
    load: number | null;
    weightedWatts: number | null;
    averageWatts: number | null;
    intensity: number | null;
    heartrate: number | null;
    decoupling: number | null;
    ftp: number | null;
  };
  streams: ActivityStreams;
  intervals: IntervalView[];
  powerZones: number[] | null;
  hrZones: number[] | null;
}

/* ---------- Planification (BFF : routes/planning.ts) ---------- */

export type Sport = 'Ride' | 'Run' | 'Swim';

export interface LibraryWorkout {
  id: string;
  name: string;
  description: string;
  sport: Sport;
}

/** Séance enregistrée par le coach sans être envoyée (« Mes séances »). */
export interface SavedWorkout {
  id: string;
  name: string;
  sport: Sport;
  description: string;
  updatedAt: string;
  favorite: boolean;
  sentCount: number;
  lastSentAt: string | null;
}

export interface LibraryFolder {
  id: string;
  name: string;
  workouts: LibraryWorkout[];
}

export interface PlanWorkout {
  /** 0 = jour de départ du plan. */
  day: number;
  name: string;
  description: string;
  /** Absent dans les plans créés avant la course et la natation : vélo. */
  sport?: Sport;
}

export interface TrainingPlan {
  id: string;
  name: string;
  workouts: PlanWorkout[];
  updatedAt: string;
}

export interface ApplyPlanResult {
  total: number;
  results: Array<{ id: string; ok: boolean; created: number; error?: string }>;
}

/* ---------- Planning d'équipe (BFF : routes/team.ts) ---------- */

export interface Group {
  id: string;
  name: string;
  athleteIds: string[];
}

export interface TeamCalendarDay {
  date: string;
  availability: 'repos' | 'indisponible' | null;
  /** Repos prescrit par le coach (distinct du repos habituel des disponibilités). Toujours renvoyé par le BFF. */
  rest?: { id: string; name: string; description: string | null } | null;
  workouts: Array<{ id: string; name: string; description: string | null; sport: string | null; load: number | null; seconds: number | null; done: boolean; activityId?: string | null }>;
  races: Array<{ id: string; name: string; priority: 'A' | 'B' | 'C' | null }>;
  activities: Array<{ id: string; name: string | null; moving_time: number | null; load: number | null }>;
}

export interface TeamCalendarAthlete {
  id: string;
  name: string;
  ftp: number | null;
  form: number | null;
  groupIds: string[];
  error: string | null;
  days: TeamCalendarDay[];
  load: { planned: number; done: number; usual: number | null };
}

export interface TeamCalendar {
  from: string;
  to: string;
  athletes: TeamCalendarAthlete[];
}
