import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { USER_A, USER_B, auth, resetDb, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/**
 * Source factice : chaque lecture est notée (athlète, type, fenêtre). Sert à
 * vérifier l'isolation (seuls les athlètes du coach sont lus) et la
 * réutilisation des clés de cache de /team (mêmes fenêtres de dates).
 */
const { reads } = vi.hoisted(() => ({ reads: [] as string[] }));
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async (athleteId: string) => ({
    athlete: async (id: string) => (reads.push(`athlete:${id}`), { id, name: id === 'iB' ? 'Bérénice' : 'Autre' }),
    wellness: async (id: string, o: string, n: string) => (reads.push(`wellness:${id}:${o}:${n}`), [
      { id: o, ctl: 40, atl: 45 },
      { id: n, ctl: 42.5, atl: 50 },
    ]),
    activities: async (id: string, o: string, n: string) => (reads.push(`activities:${id}:${o}:${n}`), [
      { id: 'a1', start_date_local: `${n}T08:00:00`, type: 'Ride', moving_time: 3600 },
      { id: 'a2', start_date_local: `${n}T18:00:00`, type: 'Run', moving_time: 1800 },
      // Hors des 4 semaines : J−28 est lu (clé de /team) mais pas compté
      { id: 'a3', start_date_local: `${o}T08:00:00`, type: 'Swim', moving_time: 999 },
    ]),
    events: async (id: string, o: string, n: string) => (reads.push(`events:${id}:${o}:${n}`), []),
    rawStreams: async () => [],
    _for: athleteId,
  }),
}));

const USER_C = '33333333-3333-4333-8333-333333333333';
const USER_D = '44444444-4444-4444-8444-444444444444';

let app: FastifyInstance;
beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  reads.length = 0;
  const { db } = await import('../src/db/index.js');
  await db().query(
    `insert into users (id, intervals_athlete_id, name, role) values ($1, 'iC', 'Coach C', 'coach'), ($2, 'iD', 'Athlète D', 'athlete')`,
    [USER_C, USER_D],
  );
  await db().query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 day')`, [
    createHash('sha256').update('token-c').digest('hex'),
    USER_C,
  ]);
  const { linkCoachAthlete } = await import('../src/db/repo.js');
  await linkCoachAthlete(USER_A, USER_B);
  await linkCoachAthlete(USER_C, USER_D);
});

const get = (url: string, headers: Record<string, string>) => app.inject({ method: 'GET', url, headers });

describe('fitness du groupe', () => {
  it('refuse sans session (401) et à un athlète (403)', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/team/fitness' })).statusCode).toBe(401);
    expect((await get('/api/team/fitness', auth('token-b'))).statusCode).toBe(403);
    expect(reads).toEqual([]);
  });

  it('ne lit que les athlètes du coach', async () => {
    const res = await get('/api/team/fitness', auth('token-a'));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.athletes.map((a: { id: string }) => a.id)).toEqual(['iB']);
    expect(body.athletes[0].name).toBe('Bérénice');
    expect(body.athletes[0].series).toEqual([
      { date: body.from, fitness: 40 },
      { date: body.to, fitness: 42.5 },
    ]);
    expect(reads.every((r) => r.includes(':iB'))).toBe(true);
  });

  it('réutilise les lectures de /team (mêmes fenêtres, donc mêmes clés de cache)', async () => {
    await get('/api/team', auth('token-a'));
    const team = reads.filter((r) => r.startsWith('wellness:') || r.startsWith('athlete:'));
    reads.length = 0;
    await get('/api/team/fitness', auth('token-a'));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.filter((r) => !team.includes(r))).toEqual([]);
  });
});

describe('sports pratiqués', () => {
  it('refuse la vue d’équipe sans session (401) et à un athlète (403)', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/team/sports' })).statusCode).toBe(401);
    expect((await get('/api/team/sports', auth('token-b'))).statusCode).toBe(403);
    expect(reads).toEqual([]);
  });

  it("donne le nombre de sorties par sport sur 4 semaines, pour l'équipe du coach seulement", async () => {
    const res = await get('/api/team/sports', auth('token-a'));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.athletes).toEqual([{ id: 'iB', name: 'Bérénice', count: { Ride: 1, Run: 1, Swim: 0, Other: 0 } }]);
    expect(body.team).toEqual({ Ride: 1, Run: 1, Swim: 0, Other: 0 });
    expect(reads.every((r) => r.includes(':iB'))).toBe(true);
  });

  it('réutilise la lecture des sorties de /team (même fenêtre)', async () => {
    await get('/api/team', auth('token-a'));
    const team = reads.filter((r) => r.startsWith('activities:'));
    reads.length = 0;
    await get('/api/team/sports', auth('token-a'));
    const sports = reads.filter((r) => r.startsWith('activities:'));
    expect(sports).toHaveLength(1);
    expect(team).toContain(sports[0]);
  });

  it("par athlète : lui-même ou son coach ; 404 sinon, 400 si l'id est invalide", async () => {
    expect((await get('/api/athletes/iB/sports', auth('token-b'))).json().count).toEqual({ Ride: 1, Run: 1, Swim: 0, Other: 0 });
    expect((await get('/api/athletes/iB/sports', auth('token-a'))).statusCode).toBe(200);
    expect((await get('/api/athletes/iB/sports', { authorization: 'Bearer token-c' })).statusCode).toBe(404);
    expect((await get('/api/athletes/iD/sports', auth('token-b'))).statusCode).toBe(404);
    expect((await get('/api/athletes/a%20b/sports', auth('token-b'))).statusCode).toBe(400);
  });

  it('par athlète : même fenêtre que la fiche athlète (même clé de cache)', async () => {
    await get('/api/athletes/iB/overview', auth('token-b'));
    const overview = reads.filter((r) => r.startsWith('activities:'));
    reads.length = 0;
    await get('/api/athletes/iB/sports', auth('token-b'));
    expect(reads).toHaveLength(1);
    expect(overview).toContain(reads[0]);
  });
});
