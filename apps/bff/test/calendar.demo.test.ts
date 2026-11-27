import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resetDb, setupTestDb } from './helpers.js';

/**
 * Calendrier du mode démo : magasin en mémoire + DemoSource comme « Intervals.icu ».
 * Pas de base pour les athlètes démo.
 */

vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
  process.env.VAPID_PUBLIC_KEY = 'test-vapid-public';
  process.env.VAPID_PRIVATE_KEY = 'test-vapid-private';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({ statusCode: 201 })) } }));

const COACH = { authorization: 'Bearer demo' };
// Même « aujourd'hui » que l'app (Europe/Paris), sinon le test échoue entre minuit et 1 h.
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

const get = (url: string) => app.inject({ method: 'GET', url, headers: COACH });

describe('calendrier démo', () => {
  it("amorce demo-1 : une compétition A dans 6 semaines, retrouvée une seule fois dans le calendrier", async () => {
    const cal = (await get(`/api/athletes/demo-1/calendar?from=${addDays(0)}&to=${addDays(60)}`)).json();
    const races = cal.events.filter((e: { category: string }) => e.category === 'RACE_A');
    expect(races).toHaveLength(1);
    expect(races[0]).toMatchObject({ name: 'Grand Fond de démo', origin: 'app', syncStatus: 'synced', start_date_local: `${addDays(42)}T00:00:00` });
  });

  it('expose les compétitions et les deux objectifs de demo-1', async () => {
    const goals = (await get('/api/athletes/demo-1/goals')).json();
    expect(goals.races).toEqual([expect.objectContaining({ name: 'Grand Fond de démo', date: addDays(42), racePriority: 'A' })]);
    // Triés par échéance : la compétition (42 j) avant le seuil (90 j).
    expect(goals.goals.map((g: { title: string }) => g.title)).toEqual(['Finir le Grand Fond', 'FTP à 280 W']);
    expect(goals.goals[0].raceId).toBe(goals.races[0].id);
  });

  it('crée, recopie (démo) puis supprime une séance', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/athletes/demo-2/events',
      headers: COACH,
      payload: { kind: 'workout', date: addDays(3), name: 'Seuil démo', sport: 'Ride' },
    });
    expect(created.statusCode).toBe(201);
    const { event } = created.json();
    expect(event).toMatchObject({ syncStatus: 'synced', origin: 'app' });

    const after = (await get(`/api/athletes/demo-2/calendar?from=${addDays(0)}&to=${addDays(5)}`)).json();
    expect(after.events.filter((e: { name: string }) => e.name === 'Seuil démo')).toHaveLength(1);

    const del = await app.inject({ method: 'DELETE', url: `/api/athletes/demo-2/events/${event.id}`, headers: COACH });
    expect(del.json()).toEqual({ ok: true });
    const later = (await get(`/api/athletes/demo-2/calendar?from=${addDays(0)}&to=${addDays(5)}`)).json();
    expect(later.events.filter((e: { name: string }) => e.name === 'Seuil démo')).toHaveLength(0);
  });

  it("donne la vue « Aujourd'hui » de l'équipe démo", async () => {
    const res = (await get(`/api/team/today?date=${T}`)).json();
    expect(res.date).toBe(T);
    expect(res.athletes.length).toBeGreaterThan(1);
    expect(res.athletes.every((a: { status: string | null; error?: string }) => a.error || typeof a.status === 'string')).toBe(true);
  });
});
