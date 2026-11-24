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

describe('routes équipe (mode démo)', () => {
  it('refuse sans jeton', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/team' })).statusCode).toBe(401);
  });

  it('renvoie le profil coach démo', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: auth('token-a') });
    expect(res.json()).toMatchObject({ role: 'coach', demo: true });
  });

  it('renvoie les 10 cyclistes avec leurs indicateurs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/team', headers: auth('token-a') });
    expect(res.statusCode).toBe(200);
    const { athletes, errors } = res.json();
    expect(errors).toEqual([]);
    expect(athletes).toHaveLength(10);
    expect(athletes[0]).toMatchObject({ id: 'demo-0', name: 'Florian' });
    expect(typeof athletes[0].fitness).toBe('number');
    // Profil « inactif » de la démo (Paul) : alerte d'inactivité
    expect(athletes.find((a: { name: string }) => a.name === 'Paul').alerts.map((a: { code: string }) => a.code)).toContain('inactive');
  });

  it('renvoie la fiche athlète sur 90 jours', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/athletes/demo-1/overview', headers: auth('token-a') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.series).toHaveLength(91);
    expect(body.summary.name).toBe('Julie');
  });

  it("répond 404 pour un athlète hors de l'équipe et 400 pour un id invalide", async () => {
    expect((await app.inject({ method: 'GET', url: '/api/athletes/i999/overview', headers: auth('token-a') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/athletes/a%20b/overview', headers: auth('token-a') })).statusCode).toBe(400);
  });

  it("envoie une séance aux athlètes de l'équipe uniquement", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: auth('token-a'),
      payload: { athleteIds: ['demo-1', 'demo-2', 'i999'], date: '2026-11-28', name: 'Seuil 3×10', description: '- 10m 95%' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([{ id: 'demo-1', ok: true }, { id: 'demo-2', ok: true }]);
  });

  it('valide la séance envoyée', async () => {
    const send = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/workouts', headers: auth('token-a'), payload });
    expect((await send({ athleteIds: [], date: '2026-11-28', name: 'x', description: 'y' })).statusCode).toBe(400);
    expect((await send({ athleteIds: ['demo-1'], date: '28/11', name: 'x', description: 'y' })).statusCode).toBe(400);
    expect((await send({ athleteIds: ['demo-1'], date: '2026-11-28', name: '', description: 'y' })).statusCode).toBe(400);
  });
});

describe('fil et calendrier (mode démo)', () => {
  it("expose l'état public sans jeton", async () => {
    const res = await app.inject({ method: 'GET', url: '/api/public/status' });
    expect(res.json()).toEqual({ demo: true, intervals: true });
  });

  it('accepte le jeton démo', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer demo' } });
    expect(res.statusCode).toBe(200);
  });

  it("renvoie le fil de l'équipe, du plus récent au plus ancien", async () => {
    const { items } = (await app.inject({ method: 'GET', url: '/api/feed', headers: auth('token-a') })).json();
    expect(items.length).toBeGreaterThan(0);
    const dates = items.map((i: { activity: { start_date_local: string } }) => i.activity.start_date_local);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('borne la période du calendrier', async () => {
    const get = (q: string) => app.inject({ method: 'GET', url: `/api/athletes/demo-1/calendar?${q}`, headers: auth('token-a') });
    expect((await get('from=2026-11-23&to=2026-11-29')).statusCode).toBe(200);
    expect((await get('from=2026-01-01&to=2026-11-29')).statusCode).toBe(400);
    expect((await get('from=2026-11-29&to=2026-11-23')).statusCode).toBe(400);
  });
});
