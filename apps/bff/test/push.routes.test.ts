import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, USER_B, auth, resetDb, rows, setupTestDb } from './helpers.js';

const { sendMock } = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = 'test-vapid-public';
  process.env.VAPID_PRIVATE_KEY = 'test-vapid-private';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  return {
    sendMock: vi.fn(async (..._args: unknown[]) => ({ statusCode: 201 })),
  };
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: sendMock },
}));

const APPLE = 'https://web.push.apple.com/QGuQyavXutnMH1Kbc_iaf';
const FCM = 'https://fcm.googleapis.com/fcm/send/abc:def';
const KEYS = { p256dh: 'BOr6aZLLm7-pXfzA_mR8bSf4VVOyXXH3XMa9ULZkU3Ew', auth: 'k8JV6sjdbhAi-n3e' };

let app: FastifyInstance;
let redis: { flushall: () => Promise<unknown> };

beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  ({ redis } = await import('../src/cache.js'));
  app = await buildServer();
});
afterAll(() => app.close());

beforeEach(async () => {
  await redis.flushall();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ statusCode: 201 });
  await resetDb();
});
afterEach(() => vi.useRealTimers());

const subscribe = (token: 'token-a' | 'token-b', endpoint: string, keys: unknown = KEYS) =>
  app.inject({ method: 'POST', url: '/api/user/push/subscriptions', headers: auth(token), payload: { endpoint, keys } });

describe('GET /api/push/public-key', () => {
  it('renvoie la clé publique VAPID', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/push/public-key', headers: auth('token-a') });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ publicKey: 'test-vapid-public' });
  });

  it('renvoie 401 sans token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/push/public-key' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/user/push/subscriptions', () => {
  it("enregistre l'abonnement de l'appareil", async () => {
    const res = await subscribe('token-a', APPLE);
    expect(res.statusCode).toBe(200);
    expect(await rows('push_subscriptions')).toMatchObject([
      { user_id: USER_A, endpoint: APPLE, p256dh: KEYS.p256dh, auth: KEYS.auth },
    ]);
  });

  it('ne crée pas de doublon et réattribue un appareil à un autre compte', async () => {
    await subscribe('token-a', APPLE);
    await subscribe('token-b', APPLE);
    expect(await rows('push_subscriptions')).toMatchObject([{ user_id: USER_B, endpoint: APPLE }]);
  });

  // Le BFF POSTe vers l'endpoint : seuls les services de push sont acceptés (SSRF)
  it.each([
    'http://web.push.apple.com/x',
    'https://127.0.0.1/x',
    'https://redis:6379/x',
    'https://fcm.googleapis.com:8443/x',
    'https://evil.com/web.push.apple.com',
    'https://web.push.apple.com.evil.com/x',
    'pas une url',
  ])("renvoie 400 pour l'endpoint %s", async (endpoint) => {
    const res = await subscribe('token-a', endpoint);
    expect(res.statusCode).toBe(400);
    expect(await rows('push_subscriptions')).toEqual([]);
  });

  it('renvoie 400 pour des clés invalides', async () => {
    const res = await subscribe('token-a', APPLE, { p256dh: 'a b', auth: KEYS.auth });
    expect(res.statusCode).toBe(400);
  });

  it('renvoie 401 sans token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/user/push/subscriptions', payload: { endpoint: APPLE, keys: KEYS } });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/user/push/subscriptions', () => {
  it("supprime l'abonnement de l'utilisateur", async () => {
    await subscribe('token-a', APPLE);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/user/push/subscriptions',
      headers: auth('token-a'),
      payload: { endpoint: APPLE },
    });
    expect(res.statusCode).toBe(200);
    expect(await rows('push_subscriptions')).toEqual([]);
  });

  it("ne supprime pas l'abonnement d'un autre utilisateur", async () => {
    await subscribe('token-b', APPLE);
    await app.inject({
      method: 'DELETE',
      url: '/api/user/push/subscriptions',
      headers: auth('token-a'),
      payload: { endpoint: APPLE },
    });
    expect(await rows('push_subscriptions')).toHaveLength(1);
  });
});

describe('POST /api/user/push/test', () => {
  it("envoie aux seuls appareils de l'utilisateur", async () => {
    await subscribe('token-a', APPLE);
    await subscribe('token-b', FCM);
    const res = await app.inject({ method: 'POST', url: '/api/user/push/test', headers: auth('token-a') });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ devices: 1, sent: 1, failures: [] });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [sub, payload, opts] = sendMock.mock.calls[0];
    expect(sub).toEqual({ endpoint: APPLE, keys: KEYS });
    // Format Declarative Web Push : iOS affiche la notification sans le service worker
    expect(JSON.parse(payload as string)).toEqual({
      web_push: 8030,
      notification: {
        title: 'Notifications activées',
        body: 'Tu recevras ici les nouvelles sorties et les alertes.',
        navigate: 'http://localhost:5173/',
        tag: 'push-test',
        lang: 'fr',
      },
    });
    expect(opts).toMatchObject({ TTL: 4 * 60 * 60, urgency: 'normal' });
    // Apple rejette l'en-tête Topic (400 BadWebPushTopic) : jamais envoyé
    expect(opts).not.toHaveProperty('topic');
  });

  it('supprime un abonnement expiré (410)', async () => {
    await subscribe('token-a', APPLE);
    sendMock.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const res = await app.inject({ method: 'POST', url: '/api/user/push/test', headers: auth('token-a') });
    expect(res.json()).toEqual({ devices: 1, sent: 0, failures: [{ status: 410, reason: 'Gone' }] });
    expect(await rows('push_subscriptions')).toEqual([]);
  });

  it("remonte la raison d'un refus d'Apple (400) et garde l'abonnement", async () => {
    await subscribe('token-a', APPLE);
    // Forme d'un WebPushError : message générique, raison dans le corps
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('Received unexpected response code'), {
        statusCode: 400,
        body: '{"reason":"VapidPkHashMismatch"}',
      }),
    );
    const res = await app.inject({ method: 'POST', url: '/api/user/push/test', headers: auth('token-a') });
    expect(res.json()).toEqual({ devices: 1, sent: 0, failures: [{ status: 400, reason: 'VapidPkHashMismatch' }] });
    expect(await rows('push_subscriptions')).toHaveLength(1);
  });

  it('signale une erreur réseau sans code HTTP', async () => {
    await subscribe('token-a', APPLE);
    sendMock.mockRejectedValueOnce(Object.assign(new Error('getaddrinfo ENOTFOUND web.push.apple.com'), { code: 'ENOTFOUND' }));
    const res = await app.inject({ method: 'POST', url: '/api/user/push/test', headers: auth('token-a') });
    expect(res.json()).toEqual({
      devices: 1,
      sent: 0,
      failures: [{ status: null, reason: 'getaddrinfo ENOTFOUND web.push.apple.com' }],
    });
  });

  it("signale l'absence d'appareil enregistré", async () => {
    const res = await app.inject({ method: 'POST', url: '/api/user/push/test', headers: auth('token-a') });
    expect(res.json()).toEqual({ devices: 0, sent: 0, failures: [] });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("garde l'abonnement sur une erreur passagère (500)", async () => {
    await subscribe('token-a', APPLE);
    sendMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
    await app.inject({ method: 'POST', url: '/api/user/push/test', headers: auth('token-a') });
    expect(await rows('push_subscriptions')).toHaveLength(1);
  });

  it('renvoie 429 au-delà de 10 tests par jour', async () => {
    const send = () => app.inject({ method: 'POST', url: '/api/user/push/test', headers: auth('token-a') });
    for (let i = 0; i < 10; i++) expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(429);
  });
});
