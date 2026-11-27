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
    expect(athletes.map((a: { series: unknown[] }) => a.series.length)).toEqual(Array(10).fill(91));
    expect(athletes.every((a: { series: Array<{ fitness: unknown }> }) => typeof a.series[0].fitness === 'number')).toBe(true);
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

describe('sports pratiqués (mode démo)', () => {
  it("répartit les sorties de l'équipe entre plusieurs sports", async () => {
    const res = await app.inject({ method: 'GET', url: '/api/team/sports', headers: coach });
    expect(res.statusCode).toBe(200);
    const { team, athletes, errors } = res.json();
    expect(errors).toEqual([]);
    expect(athletes).toHaveLength(10);
    expect(team.Ride).toBeGreaterThan(team.Run);
    expect(team.Run).toBeGreaterThan(0);
    expect(team.Swim).toBeGreaterThan(0);
    // Le total de l'équipe est la somme des sorties de chacun
    const sum = athletes.reduce((s: number, a: { count: { Ride: number } }) => s + a.count.Ride, 0);
    expect(team.Ride).toBe(sum);
  });

  it("donne la même répartition sur la fiche de l'athlète que dans la vue d'équipe", async () => {
    const team = (await app.inject({ method: 'GET', url: '/api/team/sports', headers: coach })).json();
    const own = (await app.inject({ method: 'GET', url: '/api/athletes/demo-1/sports', headers: julie })).json();
    expect(own.count).toEqual(team.athletes.find((a: { id: string }) => a.id === 'demo-1').count);
  });
});
