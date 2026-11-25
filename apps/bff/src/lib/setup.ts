import type { IntervalsAthlete } from '../types.js';

/**
 * Checklist « Bien démarrer » : ce qu'on peut lire des réglages de connexion
 * de l'athlète dans Intervals.icu. `null` = champ absent de la réponse
 * (réglage non lisible) : l'app affiche « à vérifier » plutôt que d'inventer.
 */

/** Montres et compteurs reliés directement à Intervals.icu (import des sorties, envoi des séances). */
const PROVIDERS = [
  { provider: 'garmin', label: 'Garmin', sync: 'icu_garmin_sync_activities', upload: 'icu_garmin_upload_workouts' },
  { provider: 'coros', label: 'Coros', sync: 'coros_sync_activities', upload: 'coros_upload_workouts' },
  { provider: 'wahoo', label: 'Wahoo', sync: 'wahoo_sync_activities', upload: 'wahoo_upload_workouts' },
  { provider: 'suunto', label: 'Suunto', sync: 'suunto_sync_activities', upload: 'suunto_upload_workouts' },
] as const;

export type Provider = (typeof PROVIDERS)[number]['provider'];

export interface DeviceLink {
  provider: Provider;
  label: string;
  /** Sorties importées directement par Intervals.icu. */
  sync: boolean | null;
  /** Séances prévues envoyées automatiquement à l'appareil. */
  uploadWorkouts: boolean | null;
}

export interface SetupStatus {
  devices: DeviceLink[];
  /** Au moins un appareil importe les sorties directement (pas via Strava). */
  deviceSync: boolean | null;
  /** Au moins un appareil reçoit les séances prévues. */
  uploadWorkouts: boolean | null;
  /** Strava relié : sert à avertir quand c'est la seule source des sorties. */
  stravaLinked: boolean | null;
}

const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** true si une valeur est vraie, null si toutes sont illisibles, false sinon. */
function any(values: Array<boolean | null>): boolean | null {
  if (values.some((v) => v === true)) return true;
  return values.every((v) => v === null) ? null : false;
}

export function setupStatus(athlete: IntervalsAthlete): SetupStatus {
  const raw = athlete as unknown as Record<string, unknown>;
  const devices = PROVIDERS.map((p) => ({ provider: p.provider, label: p.label, sync: flag(raw[p.sync]), uploadWorkouts: flag(raw[p.upload]) }));
  return {
    devices,
    deviceSync: any(devices.map((d) => d.sync)),
    uploadWorkouts: any(devices.map((d) => d.uploadWorkouts)),
    stravaLinked: flag(athlete.strava_authorized),
  };
}
