import type { PushSupport } from '@/lib/push';
import type { SetupStatus } from '@/types';

/**
 * Checklist « Bien démarrer » de l'athlète invité : réglages Intervals.icu
 * (lus par le BFF) et état de cet appareil. Logique pure, testée.
 */

export type StepState = 'done' | 'todo' | 'unknown';
export type StepKey = 'garmin' | 'workouts' | 'install' | 'push';

export interface Step {
  key: StepKey;
  title: string;
  state: StepState;
  /** Marche à suivre quand l'étape reste à faire ou à vérifier. */
  help: string | null;
}

export const INTERVALS_SETTINGS_URL = 'https://intervals.icu/settings';

export interface DeviceState {
  /** App lancée depuis l'écran d'accueil. */
  standalone: boolean;
  ios: boolean;
  push: PushSupport;
  /** null tant que l'abonnement n'est pas connu. */
  pushSubscribed: boolean | null;
}

const fromFlag = (v: boolean | null | undefined): StepState => (v === true ? 'done' : v === false ? 'todo' : 'unknown');

export function buildChecklist(setup: SetupStatus | undefined, device: DeviceState): Step[] {
  const garmin = fromFlag(setup?.garminSync);
  const workouts = fromFlag(setup?.garminUploadWorkouts);
  const strava = setup?.stravaLinked
    ? ' Les sorties qui passent par Strava ne sont pas lisibles par l’app : c’est bien Garmin qu’il faut relier.'
    : '';

  const install: StepState = device.standalone ? 'done' : 'todo';
  const push: StepState =
    device.push === 'supported' ? (device.pushSubscribed === true ? 'done' : device.pushSubscribed === false ? 'todo' : 'unknown') : device.push === 'needs-install' ? 'todo' : 'unknown';

  return [
    {
      key: 'garmin',
      title: 'Garmin relié en direct',
      state: garmin,
      help:
        garmin === 'done'
          ? null
          : garmin === 'todo'
            ? `Dans Intervals.icu → Settings → Connections, relie Garmin et active l’import des activités.${strava}`
            : `À vérifier dans Intervals.icu → Settings → Connections : Garmin doit être relié et importer tes activités.${strava}`,
    },
    {
      key: 'workouts',
      title: 'Séances sur la montre',
      state: workouts,
      help:
        workouts === 'done'
          ? null
          : workouts === 'todo'
            ? 'Dans Intervals.icu → Settings → Connections → Garmin, coche « Upload planned workouts ». Les séances de ton coach arriveront sur la montre.'
            : 'À vérifier dans Intervals.icu → Settings → Connections → Garmin : « Upload planned workouts » doit être coché.',
    },
    {
      key: 'install',
      title: 'App installée',
      state: install,
      help:
        install === 'done'
          ? null
          : device.ios
            ? 'Dans Safari, touche Partager puis « Sur l’écran d’accueil », et ouvre l’app depuis son icône.'
            : 'Dans le menu du navigateur, choisis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).',
    },
    {
      key: 'push',
      title: 'Notifications',
      state: push,
      help:
        push === 'done'
          ? null
          : device.push === 'needs-install'
            ? 'Sur iPhone, les notifications ne marchent que dans l’app installée : fais d’abord l’étape précédente.'
            : device.push === 'unsupported'
              ? 'Ce navigateur ne gère pas les notifications : ouvre l’app installée sur ton téléphone.'
              : 'Pour recevoir les notifications de l’app sur cet appareil.',
    },
  ];
}

/** Texte d'invitation prérédigé, partagé par le coach avec le lien à usage unique. */
export function inviteMessage(url: string, coachName?: string): string {
  return [
    `${coachName ? `${coachName} t’invite` : 'Je t’invite'} à rejoindre son équipe sur Je suis coach.`,
    'Avant d’ouvrir le lien : crée un compte Intervals.icu (gratuit) et relie ta montre Garmin directement (pas via Strava).',
    `Lien personnel, valable 7 jours et utilisable une seule fois : ${url}`,
  ].join('\n\n');
}
