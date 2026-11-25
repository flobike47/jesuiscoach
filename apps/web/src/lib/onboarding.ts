import type { PushSupport } from '@/lib/push';
import type { SetupStatus } from '@/types';

/**
 * Checklist « Bien démarrer » de l'athlète invité : réglages Intervals.icu
 * (lus par le BFF) et état de cet appareil. Logique pure, testée.
 */

export type StepState = 'done' | 'todo' | 'unknown';
export type StepKey = 'device' | 'workouts' | 'install' | 'push';

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

/** « Garmin », « Garmin et Coros », « Garmin, Coros et Wahoo ». */
function list(labels: string[]): string {
  return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`;
}

export function buildChecklist(setup: SetupStatus | undefined, device: DeviceState): Step[] {
  const linked = fromFlag(setup?.deviceSync);
  const workouts = fromFlag(setup?.uploadWorkouts);
  const synced = (setup?.devices ?? []).filter((d) => d.sync).map((d) => d.label);
  const uploading = (setup?.devices ?? []).filter((d) => d.uploadWorkouts).map((d) => d.label);
  const strava = setup?.stravaLinked
    ? ' Les sorties qui passent par Strava ne sont pas lisibles par l’app : c’est ta montre ou ton compteur qu’il faut relier.'
    : '';

  const install: StepState = device.standalone ? 'done' : 'todo';
  const push: StepState =
    device.push === 'supported' ? (device.pushSubscribed === true ? 'done' : device.pushSubscribed === false ? 'todo' : 'unknown') : device.push === 'needs-install' ? 'todo' : 'unknown';

  return [
    {
      key: 'device',
      title: linked === 'done' && synced.length ? `${list(synced)} relié${synced.length > 1 ? 's' : ''} en direct` : 'Montre ou compteur relié',
      state: linked,
      help:
        linked === 'done'
          ? null
          : linked === 'todo'
            ? `Dans Intervals.icu → Settings → Connections, relie ta montre ou ton compteur (Garmin, Coros, Wahoo, Suunto…) et active l’import des activités.${strava}`
            : `À vérifier dans Intervals.icu → Settings → Connections : ta montre ou ton compteur doit être relié et importer tes activités.${strava}`,
    },
    {
      key: 'workouts',
      title: workouts === 'done' && uploading.length ? `Séances envoyées vers ${list(uploading)}` : 'Séances sur la montre',
      state: workouts,
      help:
        workouts === 'done'
          ? null
          : workouts === 'todo'
            ? 'Dans Intervals.icu → Settings → Connections, ouvre ta montre ou ton compteur et coche « Upload planned workouts ». Les séances de ton coach y arriveront.'
            : 'À vérifier dans Intervals.icu → Settings → Connections : « Upload planned workouts » doit être coché pour ta montre ou ton compteur.',
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
    'Avant d’ouvrir le lien : crée un compte Intervals.icu (gratuit) et relie ta montre ou ton compteur (Garmin, Coros, Wahoo…) directement, pas via Strava.',
    `Lien personnel, valable 7 jours et utilisable une seule fois : ${url}`,
  ].join('\n\n');
}
