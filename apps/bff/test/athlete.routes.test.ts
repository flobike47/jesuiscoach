import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_B, auth, resetDb, rows, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

let app: FastifyInstance;
beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(() => resetDb());

const today = () => new Date().toISOString().slice(0, 10);
const post = (payload: Record<string, unknown>, token: 'token-a' | 'token-b' = 'token-b') =>
  app.inject({ method: 'POST', url: '/api/me/checkins', headers: auth(token), payload });

describe('ressenti (POST /api/me/checkins)', () => {
  it("enregistre le ressenti du jour et le remplace s'il est ressaisi", async () => {
    expect((await post({ day: today(), feeling: 4, rpe: 7, note: '  Jambes lourdes  ' })).statusCode).toBe(200);
    expect((await post({ day: today(), feeling: 2 })).statusCode).toBe(200);
    const saved = await rows('checkins');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ user_id: USER_B, feeling: 2, rpe: null, note: null });
  });

  it.each([
    [{ day: today(), feeling: 0 }],
    [{ day: today(), feeling: 6 }],
    [{ day: today(), feeling: 3.5 }],
    [{ day: today(), feeling: 3, rpe: 11 }],
    [{ day: '2020-01-01', feeling: 3 }],
    [{ day: 'hier', feeling: 3 }],
    [{ feeling: 3 }],
  ])('refuse %j', async (payload) => {
    expect((await post(payload)).statusCode).toBe(400);
  });

  it('exige une session', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/me/checkins', payload: { day: today(), feeling: 3 } })).statusCode).toBe(401);
  });

  it("coupe une note trop longue à 500 caractères", async () => {
    await post({ day: today(), feeling: 3, note: 'x'.repeat(800) });
    expect(((await rows<{ note: string }>('checkins'))[0].note).length).toBe(500);
  });
});

describe('outils démo hors mode démo', () => {
  it('sont introuvables', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/demo/simulate-ride', headers: auth('token-a') })).statusCode).toBe(404);
  });
});
