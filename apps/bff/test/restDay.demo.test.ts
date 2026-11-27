import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resetDb, setupTestDb } from './helpers.js';

/**
 * Repos prescrit par le coach (mode démo : magasin en mémoire, DemoSource comme
 * « Intervals.icu ») : visible dans le planning d'équipe et jamais proposé par
 * « Attribuer au meilleur jour ».
 */

vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

const COACH = { authorization: 'Bearer demo' };
// Même « aujourd'hui » que l'app (Europe/Paris).
const T = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (n: number) => new Date(Date.parse(`${T}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

let app: FastifyInstance;
beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
});

/** Programme un repos (une seule fois par jour et par athlète : le magasin démo vit le temps du fichier). */
async function prescribeRest(athleteId: string, date: string) {
  const res = await app.inject({ method: 'POST', url: `/api/athletes/${athleteId}/events`, headers: COACH, payload: { kind: 'rest', date } });
  expect(res.statusCode).toBe(201);
  return res.json().event as { id: string };
}

describe('repos prescrit (mode démo)', () => {
  it('apparaît dans /team/calendar sur son jour, et seulement ce jour-là', async () => {
    const event = await prescribeRest('demo-2', addDays(3));
    const res = await app.inject({ method: 'GET', url: `/api/team/calendar?from=${addDays(1)}&to=${addDays(7)}`, headers: COACH });
    expect(res.statusCode).toBe(200);
    const athlete = res.json().athletes.find((a: { id: string }) => a.id === 'demo-2');
    const byDate = new Map(athlete.days.map((d: { date: string; rest: unknown }) => [d.date, d.rest]));
    expect(byDate.get(addDays(3))).toEqual({ id: event.id, name: 'Repos', description: null });
    expect(byDate.get(addDays(4))).toBeNull();
    // Un repos n'est pas une séance : pas de charge prévue en plus.
    expect(athlete.days.find((d: { date: string }) => d.date === addDays(3)).workouts).toEqual([]);
  });

  it("n'est jamais proposé par « Attribuer au meilleur jour »", async () => {
    const restDay = addDays(1);
    await prescribeRest('demo-3', restDay);
    const res = await app.inject({
      method: 'POST',
      url: '/api/assign/suggest',
      headers: COACH,
      payload: { description: '- 45m 65%', sport: 'Ride', athleteIds: ['demo-3'], from: restDay, to: addDays(6) },
    });
    expect(res.statusCode).toBe(200);
    const [suggestion] = res.json().suggestions;
    expect(suggestion.date).not.toBe(restDay);
    expect(suggestion.alternatives).not.toContain(restDay);
  });
});
