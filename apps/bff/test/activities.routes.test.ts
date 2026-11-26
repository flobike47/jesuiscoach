import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { dbContext, storeSyncedActivities } from '../src/activityStore.js';
import { db } from '../src/db/index.js';
import { linkCoachAthlete } from '../src/db/repo.js';
import { sourceFor, type AthleteSource } from '../src/sources.js';
import type { IntervalsActivity, IntervalsStream } from '../src/types.js';
import { USER_A, USER_B, auth, resetDb, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/** Athlète B (iB) : FTP 250 W, FC seuil 170 (dans la source factice ci-dessous). Une seule sortie, aujourd'hui. */
const TODAY = new Date().toISOString().slice(0, 10);
const RIDE: IntervalsActivity = { id: 'a1', start_date_local: `${TODAY}T09:00:00`, type: 'Ride', name: 'Seuil', moving_time: 3600, distance: 40_000, icu_training_load: 90 };

function hourStreams(): IntervalsStream[] {
  const time = Array.from({ length: 3600 }, (_, i) => i);
  return [
    { type: 'time', data: time },
    { type: 'watts', data: time.map(() => 250) },
  ];
}

/** Source Intervals.icu factice : seule la sortie `RIDE` existe pour l'athlète B. */
const { state } = vi.hoisted(() => ({ state: { rides: [] as IntervalsActivity[] } }));
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async (): Promise<Partial<AthleteSource>> => ({
    athlete: async () => ({ id: 'iB', name: 'Athlète B', icu_weight: 70, sportSettings: [{ types: ['Ride'], ftp: 250, lthr: 170, max_hr: 190 }] }),
    wellness: async () => [],
    activities: async () => state.rides,
    events: async () => [],
    activity: async (id, activityId) => ({ ...RIDE, id: activityId, icu_athlete_id: id, icu_intervals: [] }),
    streams: async () => ({ step: 1, time: [], watts: null, heartrate: null }),
    powerCurves: async () => ({ list: [] }),
    rawStreams: async () => hourStreams(),
  }),
}));

let app: FastifyInstance;

beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());

beforeEach(async () => {
  await resetDb();
  state.rides = [RIDE];
  // Fiche de B : FTP 250 W, FC seuil 170 bpm (les bornes des zones viennent de là).
  await db().query(`insert into athlete_profile (user_id) values ($1)`, [USER_B]);
  await db().query(`insert into athlete_physiology (user_id, sport, ftp, lthr, updated_by) values ($1, 'Ride', 250, 170, 'athlete')`, [USER_B]);
  // La sortie est copiée dans l'app, comme le fait la synchro.
  const src = (await sourceFor('iB')) as AthleteSource;
  await storeSyncedActivities(dbContext(USER_B), 'iB', src, [RIDE], new Set(['a1']), () => undefined);
});

const get = (url: string, token: 'token-a' | 'token-b' | null) => app.inject({ method: 'GET', url, headers: token ? auth(token) : {} });

describe('lectures : copie de l’app quand elle existe', () => {
  it('la fiche athlète calcule fitness et forme dans l’app (90 jours), avec source « app »', async () => {
    const res = await get('/api/athletes/iB/overview', 'token-b');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe('app');
    expect(body.series).toHaveLength(91);
    expect(body.summary.fitness).toBeGreaterThan(0);
    expect(body.summary.form).toBeCloseTo(body.summary.fitness - body.summary.fatigue, 0);
  });

  it('sans sortie en base, la fiche garde Intervals.icu (source « intervals »)', async () => {
    const res = await get('/api/athletes/iA/overview', 'token-a');
    expect(res.statusCode).toBe(200);
    expect(res.json().source).toBe('intervals');
  });

  it('la courbe de puissance vient des meilleures puissances stockées', async () => {
    const res = await get('/api/athletes/iB/power', 'token-b');
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v.curves['90d']).toContainEqual({ secs: 3600, watts: 250 });
    expect(v.records['90d'].find((r: { secs: number }) => r.secs === 3600)).toMatchObject({ watts: 250, activityName: 'Seuil', date: TODAY });
    expect(v.ftp).toBe(250);
  });

  it('les zones viennent des temps calculés par l’app, avec les bornes de la fiche', async () => {
    const res = await get('/api/athletes/iB/zones', 'token-b');
    const v = res.json();
    expect(v.source).toBe('app');
    expect(v.ridesWithPower).toBe(1);
    // 55 % de 250 W = 137,5 → 138 : borne haute de Z1.
    expect(v.powerZones[0].to).toBe(138);
  });

  it('le détail d’une sortie donne la charge calculée par l’app', async () => {
    const res = await get('/api/athletes/iB/activities/a1', 'token-b');
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v.source).toBe('app');
    expect(v.activity.load).toBe(100);
    expect(v.streams.time.length).toBeGreaterThan(0);
  });

  it('le fil d’activité remplace la charge Intervals.icu par celle de l’app', async () => {
    await linkCoachAthlete(USER_A, USER_B);
    const v = (await get('/api/feed', 'token-a')).json();
    expect(v.items[0].activity.icu_training_load).toBe(100);
  });

  it('l’équipe indique la source de chaque indicateur', async () => {
    await linkCoachAthlete(USER_A, USER_B);
    const v = (await get('/api/team', 'token-a')).json();
    expect(v.athletes[0]).toMatchObject({ id: 'iB', source: 'app' });
  });
});

describe('comparaison app / Intervals.icu', () => {
  it('compare sortie par sortie et donne l’écart moyen', async () => {
    const res = await get('/api/athletes/iB/metrics/compare?days=30', 'token-b');
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v.items[0]).toMatchObject({ id: 'a1', method: 'power', app: { load: 100 }, intervals: { load: 90 }, diffPct: 11.1 });
    expect(v.meanDiffPct).toBe(11.1);
  });

  it('exige une session (401) et un accès (404 hors équipe)', async () => {
    expect((await get('/api/athletes/iB/metrics/compare', null)).statusCode).toBe(401);
    expect((await get('/api/athletes/iA/metrics/compare', 'token-b')).statusCode).toBe(404);
    expect((await get('/api/athletes/iB/metrics/compare?days=abc', 'token-b')).statusCode).toBe(200);
  });
});
