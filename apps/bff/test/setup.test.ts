import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupStatus } from '../src/lib/setup.js';
import type { IntervalsAthlete } from '../src/types.js';
import { auth, resetDb, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/** Source factice : réglages de connexion de l'athlète demandé, avec trace des appels. */
const { state } = vi.hoisted(() => ({ state: { asked: [] as string[], profile: {} as Partial<IntervalsAthlete> } }));
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async () => ({
    athlete: async (id: string) => (state.asked.push(id), { id, ...state.profile }),
  }),
}));

describe('setupStatus', () => {
  it('lit les réglages de connexion', () => {
    expect(setupStatus({ id: 'i1', icu_garmin_sync_activities: true, icu_garmin_upload_workouts: false, strava_authorized: true })).toEqual({
      garminSync: true,
      garminUploadWorkouts: false,
      stravaLinked: true,
    });
  });

  it("renvoie null pour un réglage absent ou illisible plutôt que de l'inventer", () => {
    expect(setupStatus({ id: 'i1' })).toEqual({ garminSync: null, garminUploadWorkouts: null, stravaLinked: null });
    expect(setupStatus({ id: 'i1', icu_garmin_sync_activities: 'oui' as never })).toMatchObject({ garminSync: null });
  });
});

describe('GET /api/me/setup', () => {
  let app: FastifyInstance;
  let redis: import('ioredis').Redis;
  beforeAll(async () => {
    await setupTestDb();
    const { buildServer } = await import('../src/server.js');
    ({ redis } = (await import('../src/cache.js')) as never);
    app = await buildServer();
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await redis.flushall();
    await resetDb();
    state.asked = [];
    state.profile = { icu_garmin_sync_activities: true, icu_garmin_upload_workouts: false };
  });

  const get = (q = '', token: 'token-a' | 'token-b' | null = 'token-b') =>
    app.inject({ method: 'GET', url: `/api/me/setup${q}`, headers: token ? auth(token) : {} });

  it('exige une session', async () => {
    expect((await get('', null)).statusCode).toBe(401);
  });

  it("ne lit que le profil de l'utilisateur connecté", async () => {
    const res = await get('?athleteId=iA');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ garminSync: true, garminUploadWorkouts: false, stravaLinked: null });
    expect(state.asked).toEqual(['iB']);
  });

  it('« Revérifier » vide le cache du profil et consomme le quota de synchro manuelle', async () => {
    await redis.set('icu:athlete:iB:', '{}');
    await redis.set('icu:athlete:iA:', '{}');
    expect((await get('?refresh=1')).statusCode).toBe(200);
    expect(await redis.get('icu:athlete:iB:')).toBeNull();
    expect(await redis.get('icu:athlete:iA:')).toBe('{}');
    await redis.set('quota:manualSync:22222222-2222-4222-8222-222222222222', '30');
    expect((await get('?refresh=1')).statusCode).toBe(429);
    // Sans refresh, la lecture reste possible.
    expect((await get()).statusCode).toBe(200);
  });
});
