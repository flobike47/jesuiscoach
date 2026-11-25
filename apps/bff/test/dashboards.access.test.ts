import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AthleteSource } from '../src/sources.js';
import { USER_A, USER_B, auth, resetDb, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/** Source factice : la sortie demandée appartient à `owner`. */
const { state } = vi.hoisted(() => ({ state: { owner: 'iB' } }));
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async (): Promise<Partial<AthleteSource>> => ({
    athlete: async (id) => ({ id }),
    powerCurves: async () => ({ list: [] }),
    activity: async (_id, activityId) => ({ id: activityId, start_date_local: '2026-11-24T09:00:00', icu_athlete_id: state.owner }),
    streams: async () => ({ step: 1, time: [], watts: null, heartrate: null }),
  }),
}));

let app: FastifyInstance;
beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  state.owner = 'iB';
});

const get = (url: string, token: 'token-a' | 'token-b') => app.inject({ method: 'GET', url, headers: auth(token) });

describe('tableaux de bord : accès', () => {
  it("un coach ne voit que ses athlètes (404 sinon)", async () => {
    expect((await get('/api/athletes/iB/power', 'token-a')).statusCode).toBe(404);
    const { linkCoachAthlete } = await import('../src/db/repo.js');
    await linkCoachAthlete(USER_A, USER_B);
    expect((await get('/api/athletes/iB/power', 'token-a')).statusCode).toBe(200);
  });

  it('un athlète voit ses propres tableaux, pas ceux des autres', async () => {
    expect((await get('/api/athletes/iB/activities/i1', 'token-b')).statusCode).toBe(200);
    expect((await get('/api/athletes/iA/zones', 'token-b')).statusCode).toBe(404);
  });

  it("refuse une sortie qui n'appartient pas à l'athlète demandé", async () => {
    state.owner = 'iZ';
    expect((await get('/api/athletes/iB/activities/i1', 'token-b')).statusCode).toBe(404);
  });
});
