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

describe('route /team/calendar (mode démo)', () => {
  it('refuse sans jeton', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/team/calendar?from=2026-11-26&to=2026-11-27' })).statusCode).toBe(401);
  });

  it('refuse pour un athlète', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-27',
      headers: auth('token-b'),
    });
    expect(res.statusCode).toBe(403);
  });

  it('valide les paramètres from/to', async () => {
    const send = (from: string, to: string) =>
      app.inject({
        method: 'GET',
        url: `/api/team/calendar?from=${from}&to=${to}`,
        headers: auth('token-a'),
      });
    expect((await send('', '2026-11-27')).statusCode).toBe(400);
    expect((await send('2026-11-26', '')).statusCode).toBe(400);
    expect((await send('invalid', '2026-11-27')).statusCode).toBe(400);
    expect((await send('2026-11-27', '2026-11-26')).statusCode).toBe(400);
  });

  it('refuse une période > 34 jours', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-01&to=2026-12-06',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('renvoie le calendrier d\'équipe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-27',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.from).toBe('2026-11-26');
    expect(body.to).toBe('2026-11-27');
    expect(Array.isArray(body.athletes)).toBe(true);
    expect(body.athletes.length).toBeGreaterThan(0);
  });

  it('contient les données correctes pour chaque athlète', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-26',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(200);
    const { athletes } = res.json();
    const athlete = athletes[0];

    expect(athlete.id).toMatch(/^demo-/);
    expect(typeof athlete.name).toBe('string');
    expect(athlete.ftp === null || typeof athlete.ftp === 'number').toBe(true);
    expect(athlete.form === null || typeof athlete.form === 'number').toBe(true);
    expect(Array.isArray(athlete.groupIds)).toBe(true);
    expect(athlete.error === null || typeof athlete.error === 'string').toBe(true);
    expect(Array.isArray(athlete.days)).toBe(true);
    expect(typeof athlete.load).toBe('object');
    expect(typeof athlete.load.planned).toBe('number');
    expect(typeof athlete.load.done).toBe('number');
    expect(athlete.load.usual === null || typeof athlete.load.usual === 'number').toBe(true);
  });

  it('contient un jour par jour de la période', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-28',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(200);
    const { athletes } = res.json();
    const athlete = athletes[0];
    expect(athlete.days.length).toBe(3); // 26, 27, 28
    expect(athlete.days[0].date).toBe('2026-11-26');
    expect(athlete.days[1].date).toBe('2026-11-27');
    expect(athlete.days[2].date).toBe('2026-11-28');
  });

  it('structure correctement les jours', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-26',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(200);
    const { athletes } = res.json();
    const day = athletes[0].days[0];

    expect(typeof day.date).toBe('string');
    expect(day.availability === null || day.availability === 'repos' || day.availability === 'indisponible').toBe(true);
    expect(Array.isArray(day.workouts)).toBe(true);
    expect(Array.isArray(day.races)).toBe(true);
    expect(Array.isArray(day.activities)).toBe(true);
  });

  it('structure correctement une séance prévue', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-26',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(200);
    const { athletes } = res.json();
    const day = athletes[0].days[0];

    if (day.workouts.length > 0) {
      const workout = day.workouts[0];
      expect(typeof workout.id).toBe('string');
      expect(typeof workout.name).toBe('string');
      expect(workout.description === null || typeof workout.description === 'string').toBe(true);
      expect(workout.sport === null || typeof workout.sport === 'string').toBe(true);
      expect(workout.load === null || typeof workout.load === 'number').toBe(true);
      expect(workout.seconds === null || typeof workout.seconds === 'number').toBe(true);
      expect(typeof workout.done).toBe('boolean');
      expect(workout.activityId === null || typeof workout.activityId === 'string').toBe(true);
      expect(workout.activityId != null).toBe(workout.done);
    }
  });

  it('structure correctement une compétition', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-26',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(200);
    const { athletes } = res.json();
    const day = athletes[0].days[0];

    if (day.races.length > 0) {
      const race = day.races[0];
      expect(typeof race.id).toBe('string');
      expect(typeof race.name).toBe('string');
      expect(race.priority === null || race.priority === 'A' || race.priority === 'B' || race.priority === 'C').toBe(true);
    }
  });

  it('structure correctement une activité faite', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-26',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(200);
    const { athletes } = res.json();
    const day = athletes[0].days[0];

    if (day.activities.length > 0) {
      const activity = day.activities[0];
      expect(typeof activity.id).toBe('string');
      expect(activity.name === null || typeof activity.name === 'string').toBe(true);
      expect(activity.moving_time === null || typeof activity.moving_time === 'number').toBe(true);
      expect(activity.load === null || typeof activity.load === 'number').toBe(true);
    }
  });

  it('inclut les groupes de chaque athlète', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/team/calendar?from=2026-11-26&to=2026-11-26',
      headers: auth('token-a'),
    });
    expect(res.statusCode).toBe(200);
    const { athletes } = res.json();

    // demo-0 doit être dans le groupe "Route"
    const demo0 = athletes.find((a: { id: string }) => a.id === 'demo-0');
    if (demo0) {
      expect(demo0.groupIds.length).toBeGreaterThanOrEqual(1);
    }
  });
});
