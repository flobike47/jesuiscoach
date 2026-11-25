import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, USER_B, auth, resetDb, rows, setupTestDb } from './helpers.js';

vi.hoisted(() => {
  process.env.INTERVALS_WEBHOOK_SECRET = 'secret-webhook-de-test';
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

let app: FastifyInstance;
let redis: import('ioredis').Redis;
let IntervalsClient: typeof import('../src/providers/intervals.js').IntervalsClient;
beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  ({ redis } = (await import('../src/cache.js')) as never);
  ({ IntervalsClient } = await import('../src/providers/intervals.js'));
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(async () => {
  await redis.flushall();
  await resetDb();
});

const hook = (payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/public/webhooks/intervals', payload: payload as object, headers });

describe('POST /api/public/webhooks/intervals', () => {
  const events = [{ athlete_id: 'iB', type: 'CALENDAR_UPDATED' }];

  it('refuse un secret absent ou faux', async () => {
    expect((await hook({ events })).statusCode).toBe(401);
    expect((await hook({ secret: 'faux', events })).statusCode).toBe(401);
    expect((await hook({ events }, { authorization: 'Bearer faux' })).statusCode).toBe(401);
  });

  it('accepte le secret dans le corps ou en en-tête, et traite les événements', async () => {
    await redis.set('icu:events:iB:a:b', '[]');
    const res = await hook({ secret: 'secret-webhook-de-test', events });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, events: 1 });
    expect(await redis.get('icu:events:iB:a:b')).toBeNull();

    const viaHeader = await hook({ events }, { authorization: 'secret-webhook-de-test' });
    expect(viaHeader.statusCode).toBe(200);
  });

  it('répond 200 à un corps sans événement exploitable (pas de renvoi en boucle)', async () => {
    const res = await hook({ secret: 'secret-webhook-de-test', events: [{ type: 'AUTRE' }] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, events: 0 });
  });
});

describe('DELETE /api/me', () => {
  async function connectB() {
    const { saveIntervalsToken, linkCoachAthlete, upsertCheckin } = await import('../src/db/repo.js');
    const { encrypt, parseKey } = await import('../src/lib/crypto.js');
    await saveIntervalsToken(USER_B, encrypt('jeton-b', parseKey(process.env.TOKEN_ENCRYPTION_KEY!)), 'ACTIVITY:READ');
    await linkCoachAthlete(USER_A, USER_B);
    await upsertCheckin(USER_B, { day: '2026-11-24', feeling: 4, rpe: null, note: null });
    await redis.set('icu:activities:iB:a:b', '[]');
    await redis.set('icu:activities:iA:a:b', '[]');
  }

  it('exige une session', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/api/me' })).statusCode).toBe(401);
  });

  it("révoque le jeton chez Intervals.icu et efface toutes les données de l'utilisateur, et seulement les siennes", async () => {
    await connectB();
    const disconnect = vi.spyOn(IntervalsClient.prototype, 'disconnect').mockResolvedValue();

    const res = await app.inject({ method: 'DELETE', url: '/api/me', headers: auth('token-b') });
    expect(res.statusCode).toBe(200);
    expect(disconnect).toHaveBeenCalledOnce();

    expect((await rows<{ id: string }>('users')).map((u) => u.id)).toEqual([USER_A]);
    expect(await rows('intervals_tokens')).toEqual([]);
    expect(await rows('coach_athletes')).toEqual([]);
    expect(await rows('checkins')).toEqual([]);
    expect((await rows<{ user_id: string }>('sessions')).map((s) => s.user_id)).toEqual([USER_A]);
    expect(await redis.get('icu:activities:iB:a:b')).toBeNull();
    expect(await redis.get('icu:activities:iA:a:b')).toBe('[]');

    // La session supprimée ne sert plus.
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: auth('token-b') })).statusCode).toBe(401);
  });

  it('supprime le compte même si Intervals.icu refuse la révocation', async () => {
    await connectB();
    vi.spyOn(IntervalsClient.prototype, 'disconnect').mockRejectedValue(new Error('401'));
    const res = await app.inject({ method: 'DELETE', url: '/api/me', headers: auth('token-b') });
    expect(res.statusCode).toBe(200);
    expect((await rows<{ id: string }>('users')).map((u) => u.id)).toEqual([USER_A]);
  });
});
