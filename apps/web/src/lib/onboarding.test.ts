import { describe, expect, it } from 'vitest';
import { buildChecklist, inviteMessage, type DeviceState } from './onboarding';

const dev = (sync: boolean | null, upload: boolean | null) => [{ provider: 'garmin' as const, label: 'Garmin', sync, uploadWorkouts: upload }];
const installed: DeviceState = { standalone: true, ios: true, push: 'supported', pushSubscribed: true };
const states = (setup: Parameters<typeof buildChecklist>[0], device = installed) =>
  Object.fromEntries(buildChecklist(setup, device).map((s) => [s.key, s.state]));

describe('buildChecklist', () => {
  it('plusieurs services à la fois : Garmin et Coros, les deux reçoivent les séances', () => {
    const devices = [
      { provider: 'garmin' as const, label: 'Garmin', sync: true, uploadWorkouts: true },
      { provider: 'coros' as const, label: 'Coros', sync: true, uploadWorkouts: true },
      { provider: 'wahoo' as const, label: 'Wahoo', sync: false, uploadWorkouts: false },
    ];
    const [device, workouts] = buildChecklist({ devices, deviceSync: true, uploadWorkouts: true, stravaLinked: false }, installed);
    expect(device).toMatchObject({ state: 'done', title: 'Garmin et Coros reliés en direct' });
    expect(workouts).toMatchObject({ state: 'done', title: 'Séances envoyées vers Garmin et Coros' });
  });

  it('nomme les appareils reliés (Coros, Wahoo…)', () => {
    const devices = [
      { provider: 'garmin' as const, label: 'Garmin', sync: false, uploadWorkouts: false },
      { provider: 'coros' as const, label: 'Coros', sync: true, uploadWorkouts: true },
      { provider: 'wahoo' as const, label: 'Wahoo', sync: true, uploadWorkouts: false },
    ];
    const [device, workouts] = buildChecklist({ devices, deviceSync: true, uploadWorkouts: true, stravaLinked: false }, installed);
    expect(device).toMatchObject({ state: 'done', title: 'Coros et Wahoo reliés en direct' });
    expect(workouts).toMatchObject({ state: 'done', title: 'Séances envoyées vers Coros' });
  });

  it('tout est prêt', () => {
    const steps = buildChecklist({ devices: dev(true, true), deviceSync: true, uploadWorkouts: true, stravaLinked: false }, installed);
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
    expect(steps.every((s) => s.help === null)).toBe(true);
  });

  it('réglage illisible ou pas encore chargé : « à vérifier », jamais « fait »', () => {
    expect(states({ devices: dev(null, null), deviceSync: null, uploadWorkouts: null, stravaLinked: null })).toMatchObject({ device: 'unknown', workouts: 'unknown' });
    expect(states(undefined)).toMatchObject({ device: 'unknown', workouts: 'unknown' });
  });

  it('aucun appareil relié alors que Strava l’est : on explique pourquoi Strava ne suffit pas', () => {
    const garmin = buildChecklist({ devices: dev(false, false), deviceSync: false, uploadWorkouts: false, stravaLinked: true }, installed)[0];
    expect(garmin.state).toBe('todo');
    expect(garmin.help).toContain('Strava ne sont pas lisibles');
  });

  it('iPhone dans Safari : installer d’abord, les notifications en dépendent', () => {
    const steps = buildChecklist(undefined, { standalone: false, ios: true, push: 'needs-install', pushSubscribed: null });
    expect(steps[2]).toMatchObject({ key: 'install', state: 'todo' });
    expect(steps[2].help).toContain('Sur l’écran d’accueil');
    expect(steps[3]).toMatchObject({ key: 'push', state: 'todo' });
    expect(steps[3].help).toContain('d’abord');
  });

  it('notifications : à activer, inconnues, ou non gérées', () => {
    expect(states(undefined, { ...installed, pushSubscribed: false }).push).toBe('todo');
    expect(states(undefined, { ...installed, pushSubscribed: null }).push).toBe('unknown');
    expect(states(undefined, { ...installed, push: 'unsupported' }).push).toBe('unknown');
  });

  it('Android ou ordinateur : installation via le menu du navigateur', () => {
    expect(buildChecklist(undefined, { ...installed, standalone: false, ios: false })[2].help).toContain('Installer l’application');
  });
});

describe('inviteMessage', () => {
  it('rappelle Garmin direct et contient le lien', () => {
    const text = inviteMessage('https://exemple.test/connexion?invitation=abc', 'Florian');
    expect(text).toContain('Florian t’invite');
    expect(text).toContain('pas via Strava');
    expect(text).toContain('https://exemple.test/connexion?invitation=abc');
    expect(inviteMessage('u')).toContain('Je t’invite');
  });
});
