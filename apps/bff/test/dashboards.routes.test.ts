import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { auth, resetDb, setupTestDb } from './helpers.js';

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
  await resetDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());

const get = (url: string, token: 'token-a' | null = 'token-a') => app.inject({ method: 'GET', url, headers: token ? auth(token) : {} });

describe('tableaux de bord (mode démo)', () => {
  it('exige une session et des identifiants valides', async () => {
    expect((await get('/api/athletes/demo-1/power', null)).statusCode).toBe(401);
    expect((await get('/api/athletes/demo%201/power')).statusCode).toBe(400);
    expect((await get('/api/athletes/demo-1/activities/a%3Bb')).statusCode).toBe(400);
  });

  it('courbe de puissance : 90 jours et 1 an, records et modèle', async () => {
    const res = await get('/api/athletes/demo-0/power');
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v.curves['90d'].length).toBeGreaterThan(10);
    expect(v.records['90d'].map((r: { secs: number }) => r.secs)).toEqual([5, 60, 300, 1200, 3600]);
    expect(v.records['90d'].find((r: { secs: number }) => r.secs === 1200).yearBest).toBe(true);
    expect(v.models['90d'].ftp).toBeGreaterThan(100);
  });

  it('zones : 8 semaines par défaut, borné à 26', async () => {
    const v = (await get('/api/athletes/demo-0/zones')).json();
    expect(v.weeks).toHaveLength(8);
    expect(v.powerZones).toHaveLength(7);
    expect(v.ridesWithPower).toBeGreaterThan(0);
    expect((await get('/api/athletes/demo-0/zones?weeks=500')).json().weeks).toHaveLength(26);
  });

  it('détail d’une sortie : streams réduits et intervalles', async () => {
    const overview = (await get('/api/athletes/demo-0/overview')).json();
    const ids: string[] = overview.activities.map((a: { id: string }) => a.id);
    const res = await get(`/api/athletes/demo-0/activities/${ids[0]}`);
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v.activity.id).toBe(ids[0]);
    expect(v.streams.time.length).toBeLessThanOrEqual(400);
    expect(v.streams.watts).toHaveLength(v.streams.time.length);
    expect((await get('/api/athletes/demo-0/activities/inconnue')).statusCode).toBe(404);
  });
});
