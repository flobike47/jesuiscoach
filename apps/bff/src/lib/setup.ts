import type { IntervalsAthlete } from '../types.js';

/**
 * Checklist « Bien démarrer » : ce qu'on peut lire des réglages de connexion
 * de l'athlète dans Intervals.icu. `null` = champ absent de la réponse
 * (réglage non lisible) : l'app affiche « à vérifier » plutôt que d'inventer.
 */
export interface SetupStatus {
  /** Sorties Garmin importées directement par Intervals.icu (pas via Strava). */
  garminSync: boolean | null;
  /** Séances prévues envoyées automatiquement à Garmin Connect. */
  garminUploadWorkouts: boolean | null;
  /** Strava relié : sert à avertir quand c'est la seule source des sorties. */
  stravaLinked: boolean | null;
}

const flag = (v: boolean | null | undefined): boolean | null => (typeof v === 'boolean' ? v : null);

export function setupStatus(athlete: IntervalsAthlete): SetupStatus {
  return {
    garminSync: flag(athlete.icu_garmin_sync_activities),
    garminUploadWorkouts: flag(athlete.icu_garmin_upload_workouts),
    stravaLinked: flag(athlete.strava_authorized),
  };
}
