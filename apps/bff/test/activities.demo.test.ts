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

const get = (url: string) => app.inject({ method: 'GET', url, headers: auth('token-a') });

describe('copie des sorties en mode démo (mémoire)', () => {
  it('la fiche démo calcule fitness et forme dans l’app, à partir de ses sorties démo', async () => {
    const res = await get('/api/athletes/demo-0/overview');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe('app');
    expect(body.series).toHaveLength(91);
    expect(body.summary.fitness).toBeGreaterThan(0);
  });

  it('l’équipe démo calcule tous les athlètes sans erreur', async () => {
    const res = await get('/api/team');
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v.errors).toEqual([]);
    expect(v.athletes.length).toBeGreaterThan(0);
    expect(v.athletes.every((a: { source: string }) => a.source === 'app')).toBe(true);
  });

  it('le détail d’une sortie démo est calculé (charge et zones de l’app)', async () => {
    const overview = (await get('/api/athletes/demo-0/overview')).json();
    const id: string = overview.activities[0].id;
    const v = (await get(`/api/athletes/demo-0/activities/${id}`)).json();
    expect(v.source).toBe('app');
    expect(v.activity.load).toBeGreaterThan(0);
    expect(v.streams.time.length).toBeGreaterThan(0);
  });
});
