import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { setupTestDb } from './helpers.js';

vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
});

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

const coach = { authorization: 'Bearer demo' };
const julie = { authorization: 'Bearer demo-athlete' };

describe('courbe du poids (mode démo)', () => {
  it("Julie voit sa courbe sur un an, qui finit près du poids de son profil", async () => {
    const res = await app.inject({ method: 'GET', url: '/api/athletes/demo-1/weight', headers: julie });
    expect(res.statusCode).toBe(200);
    const { points } = res.json() as { points: Array<{ date: string; kg: number }> };
    expect(points.length).toBeGreaterThan(60);
    expect(points.at(-1)!.kg).toBeCloseTo(64, 0);
    const span = (Date.parse(points.at(-1)!.date) - Date.parse(points[0].date)) / 86_400_000;
    expect(span).toBeGreaterThan(300);
  });

  it('le coach démo voit les athlètes qui partagent, pas les autres', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/athletes/demo-0/weight', headers: coach })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/athletes/demo-1/weight', headers: coach })).statusCode).toBe(403);
  });

  it('Julie autorise puis retire le partage avec son coach', async () => {
    const put = (weightToCoach: boolean) => app.inject({ method: 'PUT', url: '/api/me/sharing', headers: julie, payload: { weightToCoach } });
    expect((await put(true)).json().weightToCoach).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/athletes/demo-1/weight', headers: coach })).statusCode).toBe(200);
    expect((await put(false)).json().weightToCoach).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/api/athletes/demo-1/weight', headers: coach })).statusCode).toBe(403);
  });
});
