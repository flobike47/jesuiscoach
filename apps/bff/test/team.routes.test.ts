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

describe('calendrier : déplacer et supprimer (mode démo)', () => {
  const calendar = async () =>
    (await app.inject({ method: 'GET', url: '/api/athletes/demo-3/calendar?from=2026-11-01&to=2026-12-31', headers: auth('token-a') })).json();

  it('déplace puis supprime une séance envoyée', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: auth('token-a'),
      payload: { athleteIds: ['demo-3'], date: '2026-12-02', name: 'À déplacer', description: '- 10m 70%' },
    });
    const ev = (await calendar()).events.find((e: { name: string }) => e.name === 'À déplacer');
    const move = await app.inject({ method: 'PUT', url: `/api/athletes/demo-3/events/${ev.id}`, headers: auth('token-a'), payload: { date: '2026-12-05' } });
    expect(move.statusCode).toBe(200);
    expect((await calendar()).events.find((e: { id: string }) => e.id === ev.id).start_date_local).toBe('2026-12-05T00:00:00');
    const del = await app.inject({ method: 'DELETE', url: `/api/athletes/demo-3/events/${ev.id}`, headers: auth('token-a') });
    expect(del.statusCode).toBe(200);
    expect((await calendar()).events.some((e: { id: string }) => e.id === ev.id)).toBe(false);
  });

  it('valide les entrées et masque les athlètes hors équipe', async () => {
    const put = (url: string, payload: unknown) => app.inject({ method: 'PUT', url, headers: auth('token-a'), payload: payload as object });
    expect((await put('/api/athletes/demo-3/events/x1', { date: '5 déc.' })).statusCode).toBe(400);
    expect((await put('/api/athletes/demo-3/events/a%20b', { date: '2026-12-05' })).statusCode).toBe(400);
    expect((await put('/api/athletes/i999/events/x1', { date: '2026-12-05' })).statusCode).toBe(404);
    expect((await put('/api/athletes/demo-3/events/inconnu', { date: '2026-12-05' })).statusCode).toBe(404);
  });
});

describe('parcours athlète (mode démo)', () => {
  const athlete = { authorization: 'Bearer demo-athlete' };

  it("renvoie l'écran Aujourd'hui de l'athlète démo", async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me/today', headers: athlete });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Julie');
    expect(body.week).toHaveLength(7);
    expect(body.checkin).toBeNull();
    expect(typeof body.form.fitness).toBe('number');
  });

  it("enregistre le ressenti et le montre au coach sur la fiche", async () => {
    const day = new Date().toISOString().slice(0, 10);
    expect((await app.inject({ method: 'POST', url: '/api/me/checkins', headers: athlete, payload: { day, feeling: 2, note: 'Fatiguée' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/me/today', headers: athlete })).json().checkin).toMatchObject({ feeling: 2 });
    const overview = (await app.inject({ method: 'GET', url: '/api/athletes/demo-1/overview', headers: auth('token-a') })).json();
    expect(overview.checkins[0]).toMatchObject({ day, feeling: 2, note: 'Fatiguée' });
  });

  it("refuse le tableau équipe à l'athlète", async () => {
    expect((await app.inject({ method: 'GET', url: '/api/team', headers: athlete })).statusCode).toBe(403);
  });
});
