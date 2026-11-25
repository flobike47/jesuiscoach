import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/index.js';
import { dbCareStore } from '../src/db/careRepo.js';
import { addDays } from '../src/lib/care.js';
import { demoCareStore, demoCareState } from '../src/demoCare.js';
import type { NewWorkoutEvent } from '../src/types.js';
import { USER_A, USER_B, auth, resetDb, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/** Écritures calendrier enregistrées : jamais d'appel à Intervals.icu. */
const { writes } = vi.hoisted(() => ({ writes: [] as Array<{ id: string; w: NewWorkoutEvent }> }));
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async () => ({
    createWorkout: async (id: string, w: NewWorkoutEvent) => {
      writes.push({ id, w });
      return { start_date_local: w.date };
    },
  }),
}));

const ATHLETE_B = 'iB';
const C_USER = '33333333-3333-4333-8333-333333333333';
const C_ATHLETE = 'iC';
const DAY_OFF = (weekday: number, over: Record<string, unknown> = {}) => ({ weekday, available: true, maxMinutes: null, slot: 'any', place: 'any', ...over });
const WEEK = Array.from({ length: 7 }, (_, i) => DAY_OFF(i));

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
  await db.query('insert into coach_athletes (coach_id, athlete_id) values ($1, $2)', [USER_A, USER_B]);
  await db.query(`insert into users (id, intervals_athlete_id, name) values ($1, $2, 'Hors équipe')`, [C_USER, C_ATHLETE]);
});

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: 'token-a' | 'token-b' | null, payload?: unknown) =>
  app.inject({ method, url, headers: token ? auth(token) : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });

const careUrl = (athlete = ATHLETE_B) => `/api/athletes/${athlete}/care`;

/** Aujourd'hui : les blessures et séances des tests sont datées par rapport à lui. */
const T = new Date().toISOString().slice(0, 10);

const INJURY = (over: Record<string, unknown> = {}) => ({
  title: 'Tendinite',
  startedOn: addDays(T, -5),
  expectedEnd: addDays(T, 20),
  avoidSports: ['Run'],
  avoidIntensity: false,
  ...over,
});

describe('fiche soin : accès', () => {
  it('exige une session', async () => {
    expect((await call('GET', careUrl(), null)).statusCode).toBe(401);
  });

  it("répond 404 pour un athlète hors équipe, et à un athlète qui essaie de voir un autre athlète", async () => {
    expect((await call('GET', careUrl(C_ATHLETE), 'token-a')).statusCode).toBe(404);
    expect((await call('GET', careUrl('iA'), 'token-b')).statusCode).toBe(404);
    expect((await call('PUT', careUrl(C_ATHLETE) + '/equipment', 'token-a', { powerMeter: true, hrStrap: false, smartTrainer: false, poolAccess: false })).statusCode).toBe(404);
    expect((await call('POST', careUrl(C_ATHLETE) + '/injuries', 'token-b', INJURY())).statusCode).toBe(404);
  });

  it('refuse un identifiant athlète invalide', async () => {
    expect((await call('GET', '/api/athletes/%20%20/care', 'token-a')).statusCode).toBe(400);
  });

  it('renvoie une fiche vide par défaut : 7 jours disponibles, sans blessure', async () => {
    const res = await call('GET', careUrl(), 'token-b');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      weeklyMinutes: null,
      days: WEEK,
      exceptions: [],
      equipment: { powerMeter: false, hrStrap: false, smartTrainer: false, poolAccess: false },
      injuries: { current: [], past: [] },
      updatedBy: 'athlete',
      updatedAt: null,
    });
  });
});

describe('fiche soin : semaine type et matériel', () => {
  it("remplace la semaine et garde le volume ; updated_by vaut 'athlete' quand l'athlète modifie", async () => {
    const days = WEEK.map((d) => (d.weekday === 0 ? { ...d, available: false } : d.weekday === 1 ? { ...d, maxMinutes: 60, slot: 'morning' } : d));
    expect((await call('PUT', `${careUrl()}/availability`, 'token-b', { weeklyMinutes: 480, days })).statusCode).toBe(200);
    const body = (await call('GET', careUrl(), 'token-b')).json();
    expect(body.weeklyMinutes).toBe(480);
    expect(body.days[0]).toMatchObject({ available: false });
    expect(body.days[1]).toMatchObject({ maxMinutes: 60, slot: 'morning' });
    expect(body.updatedBy).toBe('athlete');
    expect(body.updatedAt).not.toBeNull();
  });

  it("le coach modifie la fiche : updated_by vaut 'coach'", async () => {
    expect((await call('PUT', `${careUrl()}/equipment`, 'token-a', { powerMeter: true, hrStrap: true, smartTrainer: false, poolAccess: false })).statusCode).toBe(200);
    const body = (await call('GET', careUrl(), 'token-b')).json();
    expect(body.updatedBy).toBe('coach');
    expect(body.equipment).toMatchObject({ powerMeter: true, hrStrap: true });
  });

  it('refuse une semaine incomplète ou une valeur hors bornes', async () => {
    expect((await call('PUT', `${careUrl()}/availability`, 'token-b', { weeklyMinutes: null, days: WEEK.slice(1) })).statusCode).toBe(400);
    expect((await call('PUT', `${careUrl()}/availability`, 'token-b', { weeklyMinutes: null, days: WEEK.map((d) => ({ ...d, maxMinutes: 5 })) })).statusCode).toBe(400);
    expect((await call('PUT', `${careUrl()}/equipment`, 'token-b', { powerMeter: 'oui' })).statusCode).toBe(400);
  });
});

describe('fiche soin : exceptions', () => {
  it('ajoute et supprime une exception, et refuse une fin avant le début', async () => {
    const created = await call('POST', `${careUrl()}/exceptions`, 'token-b', { fromDay: '2026-12-20', toDay: '2026-12-27', note: 'Ski' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ fromDay: '2026-12-20', toDay: '2026-12-27', note: 'Ski' });
    expect((await call('POST', `${careUrl()}/exceptions`, 'token-b', { fromDay: '2026-12-27', toDay: '2026-12-20' })).statusCode).toBe(400);
    expect((await call('GET', careUrl(), 'token-b')).json().exceptions).toHaveLength(1);
    expect((await call('DELETE', `${careUrl()}/exceptions/${created.json().id}`, 'token-b')).statusCode).toBe(200);
    expect((await call('DELETE', `${careUrl()}/exceptions/${created.json().id}`, 'token-b')).statusCode).toBe(404);
  });

  it('limite à 30 exceptions (31e → 409)', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await call('POST', `${careUrl()}/exceptions`, 'token-b', { fromDay: '2027-01-01', toDay: '2027-01-02' })).statusCode).toBe(201);
    }
    expect((await call('POST', `${careUrl()}/exceptions`, 'token-b', { fromDay: '2027-01-01', toDay: '2027-01-02' })).statusCode).toBe(409);
  });

  it("ne supprime pas l'exception d'un autre athlète (404)", async () => {
    const other = await dbCareStore(C_USER).addException({ fromDay: '2026-12-20', toDay: '2026-12-21', note: null }, 'athlete');
    expect((await call('DELETE', `${careUrl()}/exceptions/${other!.id}`, 'token-b')).statusCode).toBe(404);
    expect((await call('DELETE', `${careUrl()}/exceptions/${other!.id}`, 'token-a')).statusCode).toBe(404);
    expect(await dbCareStore(C_USER).read()).toMatchObject({ exceptions: [{ id: other!.id }] });
  });
});

describe('fiche soin : blessures', () => {
  it('signale, modifie, marque guérie (passée) et supprime une blessure', async () => {
    const created = await call('POST', `${careUrl()}/injuries`, 'token-b', INJURY());
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await call('GET', careUrl(), 'token-b')).json().injuries.current.map((i: { id: string }) => i.id)).toEqual([id]);

    const healed = await call('PUT', `${careUrl()}/injuries/${id}`, 'token-b', INJURY({ endedOn: addDays(T, -1) }));
    expect(healed.statusCode).toBe(200);
    const after = (await call('GET', careUrl(), 'token-b')).json();
    expect(after.injuries.current).toEqual([]);
    expect(after.injuries.past.map((i: { id: string }) => i.id)).toEqual([id]);

    expect((await call('DELETE', `${careUrl()}/injuries/${id}`, 'token-b')).statusCode).toBe(200);
    expect((await call('GET', careUrl(), 'token-b')).json().injuries.past).toEqual([]);
  });

  it("ne modifie ni ne supprime la blessure d'un autre athlète (404)", async () => {
    const other = await dbCareStore(C_USER).addInjury({ title: 'Autre', startedOn: '2026-11-20', expectedEnd: null, endedOn: null, avoidSports: ['Run'], avoidIntensity: false, note: null }, 'athlete');
    const id = other!.id;
    expect((await call('PUT', `${careUrl()}/injuries/${id}`, 'token-b', INJURY({ title: 'Piratée' }))).statusCode).toBe(404);
    expect((await call('DELETE', `${careUrl()}/injuries/${id}`, 'token-b')).statusCode).toBe(404);
    expect((await dbCareStore(C_USER).read()).injuries[0].title).toBe('Autre');
  });

  it('limite à 30 blessures et valide les sports', async () => {
    for (let i = 0; i < 30; i++) expect((await call('POST', `${careUrl()}/injuries`, 'token-b', INJURY({ title: `B${i}`, expectedEnd: null }))).statusCode).toBe(201);
    expect((await call('POST', `${careUrl()}/injuries`, 'token-b', INJURY())).statusCode).toBe(409);
    expect((await call('POST', `${careUrl()}/injuries`, 'token-b', INJURY({ avoidSports: ['Ski'] }))).statusCode).toBe(400);
  });

  it('la base refuse un sport inconnu dans une blessure, même sans passer par le BFF', async () => {
    await expect(
      db.query(`insert into injuries (user_id, title, started_on, avoid_sports) values ($1, 'x', T, array['Ski']::text[])`, [USER_B]),
    ).rejects.toThrow();
  });
});

describe('POST /api/workouts/check', () => {
  it('réservé au coach (403 pour un athlète)', async () => {
    const res = await call('POST', '/api/workouts/check', 'token-b', { athleteIds: [ATHLETE_B], date: T, sport: 'Run' });
    expect(res.statusCode).toBe(403);
  });

  it('renvoie les avertissements de chaque athlète de l’équipe, et ignore les autres', async () => {
    await call('POST', `${careUrl()}/injuries`, 'token-b', INJURY());
    const res = await call('POST', '/api/workouts/check', 'token-a', { athleteIds: [ATHLETE_B, C_ATHLETE], date: T, sport: 'Run', durationSec: null, usesPower: false, highIntensity: false });
    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: ATHLETE_B, warnings: [{ kind: 'injury', level: 'block', title: 'Blessure en cours : Tendinite' }] });
  });

  it('valide la date et le sport', async () => {
    expect((await call('POST', '/api/workouts/check', 'token-a', { athleteIds: [ATHLETE_B], date: '01/12/2026', sport: 'Run' })).statusCode).toBe(400);
    expect((await call('POST', '/api/workouts/check', 'token-a', { athleteIds: [ATHLETE_B], date: T, sport: 'Ski' })).statusCode).toBe(400);
  });
});

describe('POST /api/workouts : blocage par blessure', () => {
  const send = (body: Record<string, unknown>) =>
    call('POST', '/api/workouts', 'token-a', { athleteIds: [ATHLETE_B], date: T, name: 'Footing', description: '- 40m 70%', sport: 'Run', ...body });

  it("n'envoie pas à un athlète bloqué, et envoie après confirmation (force)", async () => {
    await call('POST', `${careUrl()}/injuries`, 'token-b', INJURY());

    const blocked = await send({});
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json().results).toEqual([{ id: ATHLETE_B, ok: false, blocked: true, error: 'Blessure en cours : Tendinite' }]);
    expect(writes).toEqual([]);

    const forced = await send({ force: [ATHLETE_B] });
    expect(forced.json().results).toEqual([{ id: ATHLETE_B, ok: true }]);
    expect(writes.map((x) => [x.id, x.w.date, x.w.sport])).toEqual([[ATHLETE_B, T, 'Run']]);
  });

  it('envoie une séance de vélo malgré une blessure à la course', async () => {
    await call('POST', `${careUrl()}/injuries`, 'token-b', INJURY());
    const res = await send({ sport: 'Ride' });
    expect(res.json().results).toEqual([{ id: ATHLETE_B, ok: true }]);
  });

  it("bloque une séance au-dessus du seuil si la blessure l'interdit (highIntensity)", async () => {
    await call('POST', `${careUrl()}/injuries`, 'token-b', INJURY({ avoidSports: [], avoidIntensity: true }));
    expect((await send({ sport: 'Ride', highIntensity: false })).json().results[0].ok).toBe(true);
    expect((await send({ sport: 'Ride', highIntensity: true })).json().results[0]).toMatchObject({ ok: false, blocked: true });
  });
});

describe('fiche soin : mode démo (store en mémoire)', () => {
  it('seed stable : Paul blessé, Julie avec jours de repos, Sarah sans capteur', () => {
    expect(demoCareState('demo-2').injuries[0]).toMatchObject({ title: 'Tendinite au genou', avoidSports: ['Run'] });
    expect(demoCareState('demo-1').days[0].available).toBe(false);
    expect(demoCareState('demo-3').equipment.powerMeter).toBe(false);
  });

  it('les écritures du store démo modifient la fiche en mémoire, avec la trace du modificateur', async () => {
    const store = demoCareStore('demo-9');
    await store.setEquipment({ powerMeter: true, hrStrap: false, smartTrainer: false, poolAccess: true }, 'coach');
    const state = await store.read();
    expect(state.equipment).toMatchObject({ powerMeter: true, poolAccess: true });
    expect(state.updatedBy).toBe('coach');
  });
});
