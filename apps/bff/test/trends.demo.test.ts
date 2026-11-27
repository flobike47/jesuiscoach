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

describe('tendances de l’équipe (mode démo)', () => {
  it('donne la fitness de chacun des 10 athlètes sur 90 jours', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/team/fitness', headers: coach });
    expect(res.statusCode).toBe(200);
    const { athletes, errors } = res.json();
    expect(errors).toEqual([]);
    expect(athletes).toHaveLength(10);
    for (const a of athletes) {
      expect(a.series).toHaveLength(91);
      expect(typeof a.series[0].fitness).toBe('number');
    }
  });

  it('montre la même fitness que la fiche athlète', async () => {
    const team = (await app.inject({ method: 'GET', url: '/api/team/fitness', headers: coach })).json();
    const overview = (await app.inject({ method: 'GET', url: '/api/athletes/demo-1/overview', headers: coach })).json();
    const julieTeam = team.athletes.find((a: { id: string }) => a.id === 'demo-1');
    expect(julieTeam.series).toEqual(overview.series.map((p: { date: string; fitness: number }) => ({ date: p.date, fitness: p.fitness })));
  });

  it("refuse la vue d'équipe à l'athlète", async () => {
    expect((await app.inject({ method: 'GET', url: '/api/team/fitness', headers: julie })).statusCode).toBe(403);
  });
});
