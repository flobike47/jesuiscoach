import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/index.js';
import { libraryView } from '../src/lib/library.js';
import { planDates, validatePlanWorkouts } from '../src/lib/plans.js';
import type { NewWorkoutEvent } from '../src/types.js';
import { USER_A, USER_B, auth, resetDb, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/** Source factice : bibliothèque fixe, écritures calendrier enregistrées (jamais d'appel à Intervals.icu). */
const { writes, state } = vi.hoisted(() => ({ writes: [] as Array<{ id: string; w: NewWorkoutEvent }>, state: { failFor: '' } }));
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async () => ({
    folders: async () => [
      { id: 1, name: 'Hiver', children: [{ id: 11, name: 'Tempo', type: 'Ride', description: '- 20m 80%' }] },
    ],
    createWorkout: async (id: string, w: NewWorkoutEvent) => {
      if (id === state.failFor) throw new Error('refus');
      writes.push({ id, w });
      return { start_date_local: w.date };
    },
  }),
}));

describe('libraryView', () => {
  it('garde les séances vélo avec une structure, et les dossiers non vides', () => {
    const v = libraryView([
      {
        id: 1,
        name: ' Hiver ',
        children: [
          { id: 11, name: 'Tempo', type: 'Ride', description: '- 20m 80%' },
          { id: 12, name: 'Footing', type: 'Run', description: '- 30m Z2' },
          { id: 13, name: 'Vide', type: 'Ride', description: '  ' },
          { id: 14, name: null, type: null, description: '- 10m 60%' },
        ],
      },
      { id: 2, name: 'Course', children: [{ id: 21, type: 'Run', description: '- 1h Z2' }] },
      { id: 3, name: null, children: null },
    ]);
    expect(v).toEqual([
      {
        id: '1',
        name: 'Hiver',
        workouts: [
          { id: '11', name: 'Tempo', description: '- 20m 80%' },
          { id: '14', name: 'Séance', description: '- 10m 60%' },
        ],
      },
    ]);
  });

  it('supporte une réponse inattendue', () => {
    expect(libraryView(null as never)).toEqual([]);
  });
});

describe('plans : validation et dates', () => {
  const w = (day: number) => ({ day, name: `J${day}`, description: '- 10m 70%' });

  it('trie par jour et borne le contenu', () => {
    expect(validatePlanWorkouts([w(7), w(0), w(2)]).map((x) => x.day)).toEqual([0, 2, 7]);
    expect(() => validatePlanWorkouts([])).toThrow(/au moins une/);
    expect(() => validatePlanWorkouts(Array.from({ length: 41 }, (_, i) => w(i)))).toThrow(/40 séances/);
    expect(() => validatePlanWorkouts([w(84)])).toThrow(/jour invalide/);
    expect(() => validatePlanWorkouts([w(1.5)])).toThrow(/jour invalide/);
    expect(() => validatePlanWorkouts([{ day: 0, name: '', description: '- 10m 70%' }])).toThrow();
  });

  it("place les séances à partir du jour de départ, à travers l'heure d'été et les mois", () => {
    expect(planDates('2026-03-27', [w(0), w(2), w(7)]).map((x) => x.date)).toEqual(['2026-03-27', '2026-03-29', '2026-04-03']);
    expect(planDates('2026-12-30', [w(3)])[0].date).toBe('2027-01-02');
  });
});

let app: FastifyInstance;
let db: Db;
let redis: { flushall: () => Promise<unknown>; set: (k: string, v: string) => Promise<unknown> };
beforeAll(async () => {
  db = await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  ({ redis } = (await import('../src/cache.js')) as never);
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(async () => {
  await redis.flushall();
  await resetDb();
  writes.length = 0;
  state.failFor = '';
  await db.query('insert into coach_athletes (coach_id, athlete_id) values ($1, $2)', [USER_A, USER_B]);
});

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: 'token-a' | 'token-b' | null, payload?: unknown) =>
  app.inject({ method, url, headers: token ? auth(token) : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });

const PLAN = {
  name: 'Bloc seuil',
  workouts: [
    { day: 7, name: 'Seuil 2×15', description: '2x\n- 15m 100%\n- 5m 55%' },
    { day: 0, name: 'Endurance', description: '- 1h 70%' },
    { day: 2, name: 'Tempo', description: '- 40m 80%' },
  ],
};

describe('routes de planification', () => {
  it('exige une session de coach', async () => {
    expect((await call('GET', '/api/plans', null)).statusCode).toBe(401);
    expect((await call('GET', '/api/library', null)).statusCode).toBe(401);
    expect((await call('GET', '/api/plans', 'token-b')).statusCode).toBe(403);
    expect((await call('GET', '/api/library', 'token-b')).statusCode).toBe(403);
  });

  it('lit la bibliothèque Intervals.icu du coach', async () => {
    const res = await call('GET', '/api/library', 'token-a');
    expect(res.json()).toEqual({ folders: [{ id: '1', name: 'Hiver', workouts: [{ id: '11', name: 'Tempo', description: '- 20m 80%' }] }] });
  });

  it('crée, liste, modifie et supprime un plan', async () => {
    const created = await call('POST', '/api/plans', 'token-a', PLAN);
    expect(created.statusCode).toBe(201);
    const plan = created.json();
    expect(plan.workouts.map((w: { day: number }) => w.day)).toEqual([0, 2, 7]);
    expect((await call('GET', '/api/plans', 'token-a')).json().plans).toHaveLength(1);

    const updated = await call('PUT', `/api/plans/${plan.id}`, 'token-a', { ...PLAN, name: 'Bloc seuil v2' });
    expect(updated.json().name).toBe('Bloc seuil v2');
    expect((await call('DELETE', `/api/plans/${plan.id}`, 'token-a')).statusCode).toBe(200);
    expect((await call('GET', '/api/plans', 'token-a')).json().plans).toEqual([]);
    expect((await call('DELETE', `/api/plans/${plan.id}`, 'token-a')).statusCode).toBe(404);
  });

  it('refuse les entrées invalides', async () => {
    expect((await call('POST', '/api/plans', 'token-a', { name: 'x', workouts: [] })).statusCode).toBe(400);
    expect((await call('POST', '/api/plans', 'token-a', { name: 'x', workouts: [{ day: 99, name: 'a', description: 'b' }] })).statusCode).toBe(400);
    expect((await call('POST', '/api/plans', 'token-a', { workouts: PLAN.workouts })).statusCode).toBe(400);
    expect((await call('PUT', '/api/plans/pas-un-uuid', 'token-a', PLAN)).statusCode).toBe(400);
  });

  it("isole les plans d'un coach à l'autre", async () => {
    const plan = (await call('POST', '/api/plans', 'token-a', PLAN)).json();
    await db.query(`update users set role = 'coach' where id = $1`, [USER_B]);
    expect((await call('GET', '/api/plans', 'token-b')).json().plans).toEqual([]);
    expect((await call('PUT', `/api/plans/${plan.id}`, 'token-b', PLAN)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/plans/${plan.id}`, 'token-b')).statusCode).toBe(404);
    expect((await call('POST', `/api/plans/${plan.id}/apply`, 'token-b', { athleteIds: ['iB'], startDate: '2026-12-01' })).statusCode).toBe(404);
  });

  it('limite le nombre de plans par coach', async () => {
    const { insertPlan } = await import('../src/db/repo.js');
    for (let i = 0; i < 30; i++) await insertPlan(USER_A, `P${i}`, PLAN.workouts, 30);
    expect((await call('POST', '/api/plans', 'token-a', PLAN)).statusCode).toBe(409);
  });

  it('la base refuse un plan hors bornes, même sans passer par le BFF', async () => {
    const big = JSON.stringify(Array.from({ length: 41 }, (_, i) => ({ day: i, name: 'x', description: 'y' })));
    await expect(db.query(`insert into training_plans (coach_id, name, workouts) values ($1, 'x', $2::jsonb)`, [USER_A, big])).rejects.toThrow();
    await expect(db.query(`insert into training_plans (coach_id, name, workouts) values ($1, 'x', '{}'::jsonb)`, [USER_A])).rejects.toThrow();
  });

  it("applique un plan aux athlètes de l'équipe, aux bonnes dates", async () => {
    const plan = (await call('POST', '/api/plans', 'token-a', PLAN)).json();
    const res = await call('POST', `/api/plans/${plan.id}/apply`, 'token-a', { athleteIds: ['iB', 'iZ', 'iB'], startDate: '2026-12-01' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ total: 3, results: [{ id: 'iB', ok: true, created: 3 }] });
    expect(writes.map((x) => [x.id, x.w.date, x.w.name])).toEqual([
      ['iB', '2026-12-01', 'Endurance'],
      ['iB', '2026-12-03', 'Tempo'],
      ['iB', '2026-12-08', 'Seuil 2×15'],
    ]);
  });

  it("signale l'échec d'un athlète sans bloquer les autres", async () => {
    await db.query(`insert into users (id, intervals_athlete_id, name) values ('33333333-3333-4333-8333-333333333333', 'iC', 'C')`);
    await db.query(`insert into coach_athletes (coach_id, athlete_id) values ($1, '33333333-3333-4333-8333-333333333333')`, [USER_A]);
    state.failFor = 'iC';
    const plan = (await call('POST', '/api/plans', 'token-a', PLAN)).json();
    const { results } = (await call('POST', `/api/plans/${plan.id}/apply`, 'token-a', { athleteIds: ['iB', 'iC'], startDate: '2026-12-01' })).json();
    expect(results).toEqual([
      { id: 'iB', ok: true, created: 3 },
      { id: 'iC', ok: false, created: 0, error: 'Envoi à Intervals.icu impossible' },
    ]);
  });

  it('refuse une application trop grosse ou une date invalide', async () => {
    const plan = (await call('POST', '/api/plans', 'token-a', PLAN)).json();
    const apply = (body: unknown) => call('POST', `/api/plans/${plan.id}/apply`, 'token-a', body);
    expect((await apply({ athleteIds: ['iB'], startDate: '01/12/2026' })).statusCode).toBe(400);
    expect((await apply({ athleteIds: [], startDate: '2026-12-01' })).statusCode).toBe(400);
    expect((await apply({ athleteIds: ['iZ'], startDate: '2026-12-01' })).statusCode).toBe(400);

    const big = { name: 'Gros', workouts: Array.from({ length: 40 }, (_, i) => ({ day: i, name: `J${i}`, description: '- 10m 70%' })) };
    const bigPlan = (await call('POST', '/api/plans', 'token-a', big)).json();
    for (const [id, a] of [['33333333-3333-4333-8333-333333333333', 'iC'], ['44444444-4444-4444-8444-444444444444', 'iD'], ['55555555-5555-4555-8555-555555555555', 'iE']]) {
      await db.query(`insert into users (id, intervals_athlete_id, name) values ($1, $2, $2)`, [id, a]);
      await db.query(`insert into coach_athletes (coach_id, athlete_id) values ($1, $2)`, [USER_A, id]);
    }
    const res = await call('POST', `/api/plans/${bigPlan.id}/apply`, 'token-a', { athleteIds: ['iB', 'iC', 'iD', 'iE'], startDate: '2026-12-01' });
    expect(res.statusCode).toBe(400);
    expect(writes).toEqual([]);
  });

  it('consomme une unité de quota par séance écrite (429 au-delà)', async () => {
    const plan = (await call('POST', '/api/plans', 'token-a', PLAN)).json();
    await redis.set(`quota:assignWorkout:${USER_A}`, '198');
    const res = await call('POST', `/api/plans/${plan.id}/apply`, 'token-a', { athleteIds: ['iB'], startDate: '2026-12-01' });
    expect(res.statusCode).toBe(429);
    expect(writes).toEqual([]);
  });
});
