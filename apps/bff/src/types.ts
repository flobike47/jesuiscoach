/** Sous-ensemble des réponses Intervals.icu utilisé par l'app (champs à confirmer au spike API). */

export interface IntervalsAthlete {
  id: string;
  name?: string;
  sportSettings?: Array<{
    types?: string[];
    ftp?: number | null;
    /** Bornes hautes des zones de puissance, en % de la FTP (dernière = 999). */
    power_zones?: number[] | null;
    /** Bornes hautes des zones cardio, en bpm. */
    hr_zones?: number[] | null;
    /** Sweet spot, en % de la FTP. */
    sweet_spot_min?: number | null;
    sweet_spot_max?: number | null;
  }>;
  icu_weight?: number | null;
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
  /** En pourcentage de la FTP (65.3 = 0,653). */
  icu_intensity?: number | null;
  average_heartrate?: number | null;
  icu_average_watts?: number | null;
  total_elevation_gain?: number | null;
  /** Séance prévue appariée par Intervals.icu, et sa conformité (%). */
  paired_event_id?: number | null;
  compliance?: number | null;
  /** Temps par zone de puissance : Z1…Z7 et SS (sweet spot), en secondes. */
  icu_zone_times?: Array<{ id: string; secs: number }> | null;
  /** Temps par zone cardio, en secondes (une valeur par zone). */
  icu_hr_zone_times?: Array<number | { id: string; secs: number }> | null;
  /** Athlète propriétaire de la sortie (contrôle d'accès du détail). */
  icu_athlete_id?: string | null;
  icu_ftp?: number | null;
  average_cadence?: number | null;
  /** Dérive cardiaque (Pw:Hr), en %. */
  decoupling?: number | null;
  /** Départ en UTC (ISO avec Z). */
  start_date?: string | null;
  /** Import dans Intervals.icu (UTC). */
  created?: string | null;
  /** Origine : 'STRAVA' = coquille vide non détaillée par l'API. */
  source?: string | null;
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

/** Intervalle détecté par Intervals.icu dans une sortie (`/activity/{id}?intervals=true`). */
export interface IntervalsInterval {
  /** WORK ou RECOVERY. */
  type?: string | null;
  label?: string | null;
  /** Indices dans les streams de la sortie. */
  start_index: number;
  end_index: number;
  moving_time?: number | null;
  elapsed_time?: number | null;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  average_heartrate?: number | null;
  average_cadence?: number | null;
  zone?: number | null;
  /** En % de la FTP. */
  intensity?: number | null;
  training_load?: number | null;
}

export interface IntervalsActivityDetail extends IntervalsActivity {
  icu_intervals?: IntervalsInterval[] | null;
}

/** Un stream de `/activity/{id}/streams.json` (un point par seconde enregistrée). */
export interface IntervalsStream {
  type: string;
  data: Array<number | null> | null;
}

/** Courbes de puissance réduites à ce que l'app affiche (cache léger). */
export interface ActivityStreams {
  /** Nombre de points d'origine regroupés par point (pour placer les intervalles). */
  step: number;
  time: number[];
  watts: Array<number | null> | null;
  heartrate: Array<number | null> | null;
}

export interface IntervalsPowerModel {
  type: string;
  criticalPower?: number | null;
  wPrime?: number | null;
  pMax?: number | null;
  ftp?: number | null;
}

/** Une courbe de `/athlete/{id}/power-curves.json` (90d, 1y…). */
export interface IntervalsPowerCurve {
  id: string;
  secs: number[];
  watts?: number[] | null;
  values?: number[] | null;
  watts_per_kg?: number[] | null;
  activity_id?: string[] | null;
  powerModels?: IntervalsPowerModel[] | null;
  weight?: number | null;
}

export interface IntervalsPowerCurves {
  list: IntervalsPowerCurve[];
  activities?: Record<string, { id: string; name?: string | null; start_date_local?: string | null }> | null;
}

/** Séance de la bibliothèque Intervals.icu (`/athlete/{id}/folders` → children). */
export interface IntervalsLibraryWorkout {
  id: number | string;
  name?: string | null;
  description?: string | null;
  type?: string | null;
  moving_time?: number | null;
  icu_training_load?: number | null;
}

/** Dossier (FOLDER) ou plan (PLAN) de la bibliothèque Intervals.icu. */
export interface IntervalsFolder {
  id: number | string;
  name?: string | null;
  type?: string | null;
  children?: IntervalsLibraryWorkout[] | null;
}
