import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resetDb, rows, setupTestDb } from './helpers.js';

const { sendMock } = vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
  process.env.VAPID_PUBLIC_KEY = 'test-vapid-public';
  process.env.VAPID_PRIVATE_KEY = 'test-vapid-private';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  return { sendMock: vi.fn(async (..._args: unknown[]) => ({ statusCode: 201 })) };
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: sendMock } }));

const COACH = { authorization: 'Bearer demo' };
const ATHLETE = { authorization: 'Bearer demo-athlete' };
const KEYS = { p256dh: 'BOr6aZLLm7-pXfzA_mR8bSf4VVOyXXH3XMa9ULZkU3Ew', auth: 'k8JV6sjdbhAi-n3e' };

let app: FastifyInstance;
beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  const { ensureDemoUsers } = await import('../src/db/repo.js');
  const { DEMO_USER, DEMO_ATHLETE } = await import('../src/auth.js');
  await ensureDemoUsers(DEMO_USER, DEMO_ATHLETE);
  sendMock.mockClear();
});

describe('comptes démo en base', () => {
  it('existent avec le lien coach → athlète, et ne se dupliquent pas', async () => {
    const { ensureDemoUsers } = await import('../src/db/repo.js');
    const { DEMO_USER, DEMO_ATHLETE } = await import('../src/auth.js');
    await ensureDemoUsers(DEMO_USER, DEMO_ATHLETE);
    const users = await rows<{ intervals_athlete_id: string }>('users');
    expect(users.filter((u) => u.intervals_athlete_id.startsWith('demo-')).map((u) => u.intervals_athlete_id).sort()).toEqual(['demo-0', 'demo-1']);
    expect(await rows('coach_athletes')).toEqual([expect.objectContaining({ coach_id: DEMO_USER.id, athlete_id: DEMO_ATHLETE.id })]);
  });

  it("permettent au coach démo d'abonner son appareil", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/user/push/subscriptions',
      headers: COACH,
      payload: { endpoint: 'https://fcm.googleapis.com/fcm/send/demo', keys: KEYS },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/demo/simulate-ride', () => {
  it('envoie au coach la notification d’une nouvelle sortie', async () => {
    await app.inject({ method: 'POST', url: '/api/user/push/subscriptions', headers: COACH, payload: { endpoint: 'https://fcm.googleapis.com/fcm/send/demo', keys: KEYS } });
    const res = await app.inject({ method: 'POST', url: '/api/demo/simulate-ride', headers: COACH });
    expect(res.statusCode).toBe(200);
    const { notification, report } = res.json();
    expect(notification.title).toMatch(/ a terminé /);
    expect(notification.url).toMatch(/^athletes\/demo-[1-9]$/);
    expect(report).toEqual({ devices: 1, sent: 1, failures: [] });
    const payload = JSON.parse(sendMock.mock.calls[0][1] as string);
    expect(payload.notification).toMatchObject({ title: notification.title, tag: notification.tag });
    // La sortie simulée apparaît dans le fil du coach
    const feed = (await app.inject({ method: 'GET', url: '/api/feed', headers: COACH })).json();
    expect(feed.items.some((i: { activity: { id: string } }) => i.activity.id.startsWith('demo-sim-'))).toBe(true);
  });

  it("est réservée au coach", async () => {
    expect((await app.inject({ method: 'POST', url: '/api/demo/simulate-ride', headers: ATHLETE })).statusCode).toBe(404);
  });
});
