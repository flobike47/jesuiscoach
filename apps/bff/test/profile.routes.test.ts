import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ProviderError } from '../src/providers/http.js';
import { USER_A, USER_B, auth, resetDb, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/**
 * Source factice : valeurs Intervals.icu modifiables par le test, écritures
 * enregistrées dans `calls` (jamais d'appel réel à Intervals.icu).
 */
const { state, calls } = vi.hoisted(() => ({
  state: { info: {} as Record<string, unknown>, error: null as unknown },
  calls: [] as Array<{ fn: string; args: unknown[] }>,
}));
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async () => ({
    athlete: async () => structuredClone(state.info),
    updateSportSettings: async (...args: unknown[]) => {
      calls.push({ fn: 'updateSportSettings', args });
      if (state.error) throw state.error;
    },
    updateAthleteProfile: async (...args: unknown[]) => {
      calls.push({ fn: 'updateAthleteProfile', args });
      if (state.error) throw state.error;
    },
    updateWellness: async (...args: unknown[]) => {
      calls.push({ fn: 'updateWellness', args });
      if (state.error) throw state.error;
    },
  }),
}));

const INFO = {
  id: 'iB',
  icu_weight: 70.5,
  icu_resting_hr: 50,
  sex: 'M',
  height: 180,
  icu_date_of_birth: '1990-03-14T00:00:00',
  sportSettings: [
    { types: ['Ride', 'VirtualRide'], ftp: 245, lthr: 172, max_hr: 190 },
    { types: ['Run', 'TrailRun'], lthr: 170, max_hr: 188, threshold_pace: 1000 / 280 },
    { types: ['Swim', 'OpenWaterSwim'], threshold_pace: 100 / 115 },
  ],
};
const FULL_SCOPE = 'ACTIVITY:READ,WELLNESS:WRITE,CALENDAR:WRITE,LIBRARY:READ,SETTINGS:WRITE';

let app: FastifyInstance;
beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  state.info = structuredClone(INFO);
  state.error = null;
  calls.length = 0;
  const { saveIntervalsToken } = await import('../src/db/repo.js');
  await saveIntervalsToken(USER_B, 'chiffre', FULL_SCOPE);
});

type Token = 'token-a' | 'token-b';
const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, token: Token, payload?: unknown) =>
  app.inject({ method, url, headers: auth(token), payload: payload as object | undefined });

async function link() {
  const { linkCoachAthlete } = await import('../src/db/repo.js');
  await linkCoachAthlete(USER_A, USER_B);
}

const profile = async (token: Token = 'token-b', athlete = 'iB') => (await call('GET', `/api/athletes/${athlete}/profile`, token)).json();

describe('fiche profil : accès', () => {
  it('refuse sans session (401)', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/athletes/iB/profile' })).statusCode).toBe(401);
  });

  it('un coach ne voit la fiche d’un athlète qu’une fois lié (404 avant)', async () => {
    expect((await call('GET', '/api/athletes/iB/profile', 'token-a')).statusCode).toBe(404);
    await link();
    expect((await call('GET', '/api/athletes/iB/profile', 'token-a')).statusCode).toBe(200);
  });

  it('un athlète ne voit pas la fiche d’un autre (404)', async () => {
    expect((await call('GET', '/api/athletes/iA/profile', 'token-b')).statusCode).toBe(404);
  });

  it('refuse un identifiant d’athlète malformé (400)', async () => {
    expect((await call('GET', '/api/athletes/a%20b/profile', 'token-b')).statusCode).toBe(400);
  });
});

describe('fiche profil : import et lecture', () => {
  it('importe les valeurs d’Intervals.icu à la première ouverture, sans rien retaper', async () => {
    const p = await profile();
    expect(p.identity).toEqual({ birthDate: '1990-03-14', sex: 'M', heightCm: 180, weightKg: 70.5, restingHr: 50 });
    expect(p.physiology.Ride).toEqual({ ftp: 245, lthr: 172, maxHr: 190, thresholdSecs: null });
    expect(p.physiology.Run).toEqual({ ftp: null, lthr: 170, maxHr: 188, thresholdSecs: 280 });
    expect(p.physiology.Swim).toEqual({ ftp: null, lthr: null, maxHr: null, thresholdSecs: 115 });
    expect(p.updatedBy).toBe('intervals');
    expect(p.suggestions).toEqual([]);
    expect(p.sync.needsReconnect).toBe(false);
  });

  it('ne réimporte pas une fiche existante et propose la nouvelle valeur d’Intervals.icu', async () => {
    await profile();
    (state.info.sportSettings as Array<{ types: string[]; ftp?: number }>)[0].ftp = 262;
    const p = await profile();
    expect(p.physiology.Ride.ftp).toBe(245);
    expect(p.suggestions).toEqual([{ sport: 'Ride', field: 'ftp', appValue: 245, intervalsValue: 262 }]);
  });

  it('signale la reconnexion quand le scope SETTINGS:WRITE manque', async () => {
    const { saveIntervalsToken } = await import('../src/db/repo.js');
    await saveIntervalsToken(USER_B, 'chiffre', 'ACTIVITY:READ,WELLNESS:READ,SETTINGS:READ');
    expect((await profile()).sync.needsReconnect).toBe(true);
  });
});

describe('fiche profil : physiologie', () => {
  it('enregistre l’allure seuil de course et pousse sa valeur en m/s', async () => {
    await profile();
    const res = await call('PUT', '/api/athletes/iB/profile/physiology/Run', 'token-b', { thresholdSecs: 275 });
    expect(res.statusCode).toBe(200);
    expect(res.json().physiology.Run.thresholdSecs).toBe(275);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('updateSportSettings');
    expect(calls[0].args[0]).toBe('iB');
    expect(calls[0].args[1]).toBe('Run');
    expect((calls[0].args[2] as { threshold_pace: number }).threshold_pace).toBeCloseTo(1000 / 275, 6);
  });

  it('refuse la FTP sur la course (400) sans rien enregistrer ni envoyer', async () => {
    await profile();
    const res = await call('PUT', '/api/athletes/iB/profile/physiology/Run', 'token-b', { ftp: 250 });
    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
    expect((await profile()).physiology.Run.ftp).toBeNull();
  });

  it('refuse une allure seuil sur le vélo (400)', async () => {
    expect((await call('PUT', '/api/athletes/iB/profile/physiology/Ride', 'token-b', { thresholdSecs: 270 })).statusCode).toBe(400);
  });

  it('refuse un sport inconnu (400)', async () => {
    expect((await call('PUT', '/api/athletes/iB/profile/physiology/Rowing', 'token-b', { ftp: 200 })).statusCode).toBe(400);
  });

  it('un coach qui modifie la fiche laisse updated_by = coach', async () => {
    await link();
    await profile('token-a');
    const res = await call('PUT', '/api/athletes/iB/profile/physiology/Ride', 'token-a', { ftp: 255 });
    expect(res.json().updatedBy).toBe('coach');
    expect(res.json().physiology.Ride.ftp).toBe(255);
  });

  it('sans scope SETTINGS:WRITE : enregistre, signale la reconnexion et n’appelle pas Intervals.icu', async () => {
    const { saveIntervalsToken } = await import('../src/db/repo.js');
    await profile();
    await saveIntervalsToken(USER_B, 'chiffre', 'ACTIVITY:READ,SETTINGS:READ,WELLNESS:READ');
    const res = await call('PUT', '/api/athletes/iB/profile/physiology/Run', 'token-b', { thresholdSecs: 275 });
    expect(res.statusCode).toBe(200);
    expect(res.json().physiology.Run.thresholdSecs).toBe(275);
    expect(res.json().sync.needsReconnect).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('erreur d’Intervals.icu : la valeur est gardée, l’erreur est notée, sans jeton', async () => {
    await profile();
    state.error = new ProviderError('secret-token-xyz', 422, 'Intervals.icu');
    const res = await call('PUT', '/api/athletes/iB/profile/physiology/Ride', 'token-b', { ftp: 250 });
    expect(res.statusCode).toBe(200);
    expect(res.json().physiology.Ride.ftp).toBe(250);
    expect(res.json().sync.error).toBe("Intervals.icu a refusé la valeur (erreur 422).");
    expect(JSON.stringify(res.json())).not.toContain('secret-token-xyz');
    expect((await profile()).physiology.Ride.ftp).toBe(250);
  });

  it('envoi réussi : synced_at renseigné et erreur effacée', async () => {
    await profile();
    state.error = new ProviderError('down', 503, 'Intervals.icu');
    await call('PUT', '/api/athletes/iB/profile/physiology/Ride', 'token-b', { ftp: 250 });
    expect((await profile()).sync.error).toBe('Intervals.icu est injoignable pour le moment.');
    state.error = null;
    const ok = (await call('PUT', '/api/athletes/iB/profile/physiology/Ride', 'token-b', { ftp: 251 })).json();
    expect(ok.sync.error).toBeNull();
    expect(ok.sync.syncedAt).not.toBeNull();
  });
});

describe('fiche profil : identité', () => {
  it('pousse le poids et la FC de repos vers le profil et la forme du jour', async () => {
    await profile();
    const res = await call('PUT', '/api/athletes/iB/profile/identity', 'token-b', { weightKg: 71.2, restingHr: 49 });
    expect(res.statusCode).toBe(200);
    expect(res.json().identity.weightKg).toBe(71.2);
    const athlete = calls.find((c) => c.fn === 'updateAthleteProfile');
    expect(athlete?.args).toEqual(['iB', { icu_weight: 71.2, icu_resting_hr: 49 }]);
    const wellness = calls.find((c) => c.fn === 'updateWellness');
    expect(wellness?.args[0]).toBe('iB');
    expect(String(wellness?.args[1])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(wellness?.args[2]).toEqual({ weight: 71.2, restingHR: 49 });
  });

  it('refuse une date de naissance trop récente (400)', async () => {
    expect((await call('PUT', '/api/athletes/iB/profile/identity', 'token-b', { birthDate: '2024-01-01' })).statusCode).toBe(400);
  });
});

describe('fiche profil : VMA, tests et suggestions', () => {
  it('VMA : enregistrée dans l’app, rien n’est envoyé à Intervals.icu', async () => {
    await profile();
    const res = await call('PUT', '/api/athletes/iB/profile/vma', 'token-b', { vmaKmh: 17.4 });
    expect(res.json().vmaKmh).toBe(17.4);
    expect(calls).toHaveLength(0);
  });

  it('test avec apply : met à jour la FTP et la pousse vers Intervals.icu', async () => {
    await profile();
    const res = await call('POST', '/api/athletes/iB/profile/tests', 'token-b', { day: '2026-11-20', kind: 'ftp', value: 251, apply: true });
    expect(res.statusCode).toBe(201);
    expect((await profile()).physiology.Ride.ftp).toBe(251);
    expect(calls).toEqual([{ fn: 'updateSportSettings', args: ['iB', 'Ride', { ftp: 251 }] }]);
  });

  it('test sans apply : garde seulement le résultat', async () => {
    await profile();
    await call('POST', '/api/athletes/iB/profile/tests', 'token-b', { day: '2026-11-20', kind: 'vma', value: 16.2 });
    const p = await profile();
    expect(p.vmaKmh).toBeNull();
    const tests = (await call('GET', '/api/athletes/iB/profile/tests', 'token-b')).json().tests;
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({ day: '2026-11-20', kind: 'vma', value: 16.2 });
  });

  it('limite de 50 tests : le 51e est refusé (409)', async () => {
    await profile();
    for (let i = 0; i < 50; i++) {
      expect((await call('POST', '/api/athletes/iB/profile/tests', 'token-b', { day: '2026-11-20', kind: 'other', value: 10 + i })).statusCode).toBe(201);
    }
    expect((await call('POST', '/api/athletes/iB/profile/tests', 'token-b', { day: '2026-11-20', kind: 'other', value: 5 })).statusCode).toBe(409);
  });

  it('supprime un test de son athlète, mais pas celui d’un autre (404)', async () => {
    await link();
    await profile();
    const created = (await call('POST', '/api/athletes/iB/profile/tests', 'token-b', { day: '2026-11-20', kind: 'other', value: 12 })).json().test;
    expect((await call('DELETE', `/api/athletes/iA/profile/tests/${created.id}`, 'token-a')).statusCode).toBe(404);
    expect((await call('DELETE', `/api/athletes/iB/profile/tests/${created.id}`, 'token-b')).statusCode).toBe(200);
    expect((await call('GET', '/api/athletes/iB/profile/tests', 'token-b')).json().tests).toHaveLength(0);
  });

  it('accepte une suggestion d’Intervals.icu : copie dans l’app, sans renvoi', async () => {
    await profile();
    (state.info.sportSettings as Array<{ types: string[]; ftp?: number }>)[0].ftp = 262;
    const res = await call('POST', '/api/athletes/iB/profile/suggestions/accept', 'token-b', { sport: 'Ride', field: 'ftp' });
    expect(res.statusCode).toBe(200);
    expect(res.json().physiology.Ride.ftp).toBe(262);
    expect(res.json().updatedBy).toBe('intervals');
    expect(res.json().suggestions).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('refuse d’accepter une suggestion qui n’existe pas (409)', async () => {
    await profile();
    expect((await call('POST', '/api/athletes/iB/profile/suggestions/accept', 'token-b', { sport: 'Ride', field: 'ftp' })).statusCode).toBe(409);
  });
});
