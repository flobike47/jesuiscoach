import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { USER_A, USER_B, auth, resetDb, rows, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/**
 * Source factice : chaque lecture est comptée. Un refus (403/404) doit
 * survenir AVANT toute lecture chez Intervals.icu (aucun appel réel ici).
 */
const { reads } = vi.hoisted(() => ({ reads: [] as Array<{ id: string; oldest: string; newest: string }> }));
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async () => ({
    wellnessHistory: async (id: string, oldest: string, newest: string) => {
      reads.push({ id, oldest, newest });
      return [
        { id: '2026-10-02', weight: 72.4 },
        { id: '2026-09-01', weight: 73.1 },
        { id: '2026-10-10', ctl: 40 },
        { id: '2026-11-01', weight: 999 },
      ];
    },
  }),
}));

/** Second coach (C) et son athlète (D), sans lien avec A et B. */
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

const tokenC = { authorization: 'Bearer token-c' };
const getWeight = (athlete: string, headers: Record<string, string>) => app.inject({ method: 'GET', url: `/api/athletes/${athlete}/weight`, headers });
const share = (headers: Record<string, string>, payload: unknown) => app.inject({ method: 'PUT', url: '/api/me/sharing', headers, payload: payload as object });

describe('courbe du poids : accès', () => {
  it('refuse sans session (401)', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/athletes/iB/weight' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PUT', url: '/api/me/sharing', payload: { weightToCoach: true } })).statusCode).toBe(401);
  });

  it("l'athlète voit toujours sa courbe, sans rien partager", async () => {
    const res = await getWeight('iB', auth('token-b'));
    expect(res.statusCode).toBe(200);
    // Triée, valeurs aberrantes et jours sans pesée écartés
    expect(res.json().points).toEqual([
      { date: '2026-09-01', kg: 73.1 },
      { date: '2026-10-02', kg: 72.4 },
    ]);
    expect(reads).toHaveLength(1);
  });

  it('le coach sans accord de l’athlète reçoit 403, sans lecture chez Intervals.icu', async () => {
    const res = await getWeight('iB', auth('token-a'));
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/ne partage pas/);
    expect(reads).toHaveLength(0);
  });

  it('le coach voit la courbe une fois l’accord donné, plus après le retrait', async () => {
    expect((await share(auth('token-b'), { weightToCoach: true })).statusCode).toBe(200);
    expect((await getWeight('iB', auth('token-a'))).statusCode).toBe(200);
    expect((await share(auth('token-b'), { weightToCoach: false })).statusCode).toBe(200);
    expect((await getWeight('iB', auth('token-a'))).statusCode).toBe(403);
  });

  it("l'accord vaut pour SON coach : un autre coach reçoit 404 même si l'athlète partage", async () => {
    await share(auth('token-b'), { weightToCoach: true });
    expect((await getWeight('iB', tokenC)).statusCode).toBe(404);
    expect(reads).toHaveLength(0);
  });

  it("un athlète ne voit pas le poids d'un autre (404)", async () => {
    const d = await share(tokenC, { weightToCoach: true });
    expect(d.statusCode).toBe(200);
    expect((await getWeight('iD', auth('token-b'))).statusCode).toBe(404);
  });

  it("le partage d'un athlète ne profite pas au coach pour un autre athlète", async () => {
    // D partage avec C ; le coach A (sans lien avec D) n'y a pas accès.
    const { db } = await import('../src/db/index.js');
    await db().query('insert into data_sharing (user_id, weight_shared_at) values ($1, now())', [USER_D]);
    expect((await getWeight('iD', auth('token-a'))).statusCode).toBe(404);
    expect((await getWeight('iD', tokenC)).statusCode).toBe(200);
  });

  it('refuse un identifiant malformé (400)', async () => {
    expect((await getWeight('a%20b', auth('token-b'))).statusCode).toBe(400);
  });
});

describe('partage du poids : réglage de l’athlète', () => {
  it('désactivé par défaut', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me/sharing', headers: auth('token-b') });
    expect(res.json()).toEqual({ weightToCoach: false, weightSince: null });
  });

  it('garde la date du premier accord et la remet à zéro au retrait', async () => {
    const first = (await share(auth('token-b'), { weightToCoach: true })).json();
    expect(first.weightToCoach).toBe(true);
    expect(typeof first.weightSince).toBe('string');
    const again = (await share(auth('token-b'), { weightToCoach: true })).json();
    expect(again.weightSince).toBe(first.weightSince);
    expect((await share(auth('token-b'), { weightToCoach: false })).json()).toEqual({ weightToCoach: false, weightSince: null });
    // Une seule ligne, celle de l'athlète connecté
    const table = await rows<{ user_id: string }>('data_sharing');
    expect(table.map((r) => r.user_id)).toEqual([USER_B]);
  });

  it("n'écrit que pour l'utilisateur de la session (le coach ne donne pas l'accord à la place de l'athlète)", async () => {
    await share(auth('token-a'), { weightToCoach: true, athleteId: 'iB' });
    expect((await getWeight('iB', auth('token-a'))).statusCode).toBe(403);
  });

  it('valide le corps (booléen strict)', async () => {
    expect((await share(auth('token-b'), { weightToCoach: 'true' })).statusCode).toBe(400);
    expect((await share(auth('token-b'), {})).statusCode).toBe(400);
    expect((await share(auth('token-b'), { weightToCoach: 1 })).statusCode).toBe(400);
  });

  it("le partage disparaît avec le compte de l'athlète (cascade)", async () => {
    await share(auth('token-b'), { weightToCoach: true });
    const { deleteUser } = await import('../src/db/repo.js');
    await deleteUser(USER_B);
    expect(await rows('data_sharing')).toEqual([]);
  });
});
