import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, USER_B, auth, resetDb, rows, setupTestDb } from './helpers.js';

/** Wahoo simulé : aucun appel réseau. */
const { fake } = vi.hoisted(() => {
  process.env.WAHOO_CLIENT_ID = 'wahoo-test';
  process.env.WAHOO_CLIENT_SECRET = 'wahoo-secret';
  process.env.WAHOO_WEBHOOK_TOKEN = 'whk-test-token';
  return { fake: { exchangeCode: vi.fn(), userId: vi.fn() } };
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

vi.mock('../src/devices/wahoo.js', async (orig) => {
  const real = await orig<typeof import('../src/devices/wahoo.js')>();
  class FakeWahooClient {
    exchangeCode = (...a: unknown[]) => fake.exchangeCode(...a);
    userId = (...a: unknown[]) => fake.userId(...a);
  }
  return { ...real, WahooClient: FakeWahooClient };
});

let app: FastifyInstance;
let redis: { flushall: () => Promise<unknown> };
let linkCoach: (coachId: string, athleteId: string) => Promise<void>;
let saveConnection: typeof import('../src/db/deviceRepo.js').saveConnection;
let encrypt: typeof import('../src/lib/crypto.js').encrypt;
let parseKey: typeof import('../src/lib/crypto.js').parseKey;
let key: Buffer;

beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  ({ redis } = await import('../src/cache.js'));
  ({ linkCoachAthlete: linkCoach } = await import('../src/db/repo.js'));
  ({ saveConnection } = await import('../src/db/deviceRepo.js'));
  ({ encrypt, parseKey } = await import('../src/lib/crypto.js'));
  key = parseKey(process.env.TOKEN_ENCRYPTION_KEY!);
  app = await buildServer();
});
afterAll(() => app.close());

beforeEach(async () => {
  await redis.flushall();
  await resetDb();
  fake.exchangeCode.mockReset();
  fake.userId.mockReset();
});

const tokens = () => ({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: new Date(Date.now() + 7200_000), scope: 'user_read' });

/** Démarre la connexion et renvoie le state de l'URL d'autorisation. */
async function startConnect(token: 'token-a' | 'token-b') {
  const res = await app.inject({ method: 'POST', url: '/api/devices/wahoo/connect', headers: auth(token) });
  expect(res.statusCode).toBe(200);
  const url = new URL((res.json() as { url: string }).url);
  return { url, state: url.searchParams.get('state')! };
}

const callback = (query: string) => app.inject({ method: 'GET', url: `/api/public/devices/wahoo/callback?${query}` });

async function seedConnection(userId: string, externalId = '999') {
  await saveConnection(userId, 'wahoo', {
    externalUserId: externalId,
    accessEnc: encrypt('access-old', key),
    refreshEnc: encrypt('refresh-old', key),
    expiresAt: new Date(Date.now() + 7200_000),
    scope: 'user_read',
  });
}

describe('connexion Wahoo', () => {
  it('refuse sans session', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/devices/wahoo/connect' });
    expect(res.statusCode).toBe(401);
  });

  it('renvoie une URL d’autorisation avec PKCE et le state', async () => {
    const { url } = await startConnect('token-b');
    expect(url.origin + url.pathname).toBe('https://api.wahooligan.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('wahoo-test');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://api.test/api/public/devices/wahoo/callback');
    expect(url.searchParams.get('scope')).toContain('offline_data');
  });

  it('retour réussi : connexion enregistrée (jetons chiffrés), redirection vers le profil', async () => {
    const { state } = await startConnect('token-b');
    fake.exchangeCode.mockResolvedValue(tokens());
    fake.userId.mockResolvedValue(4242);

    const res = await callback(`code=code-1&state=${state}`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/\/profil\/appareils#wahoo=ok$/);

    const [conn] = await rows<{ user_id: string; external_user_id: string; access_token_enc: string }>('device_connections');
    expect(conn).toMatchObject({ user_id: USER_B, external_user_id: '4242' });
    expect(conn.access_token_enc).not.toContain('access-1');
  });

  it('le state ne sert qu’une fois', async () => {
    const { state } = await startConnect('token-b');
    fake.exchangeCode.mockResolvedValue(tokens());
    fake.userId.mockResolvedValue(4242);
    await callback(`code=code-1&state=${state}`);
    const replay = await callback(`code=code-1&state=${state}`);
    expect(replay.headers.location).toMatch(/#erreur=session_expiree$/);
  });

  it('state absent ou invalide : erreur, rien n’est échangé', async () => {
    const res = await callback('code=code-1&state=court');
    expect(res.headers.location).toMatch(/#erreur=requete_invalide$/);
    expect(fake.exchangeCode).not.toHaveBeenCalled();
  });

  it('refus de l’athlète côté Wahoo', async () => {
    const res = await callback('error=access_denied');
    expect(res.headers.location).toMatch(/#erreur=refus$/);
  });

  it('compte Wahoo déjà relié à un autre athlète : refusé', async () => {
    await seedConnection(USER_B, '4242');
    const { state } = await startConnect('token-a');
    fake.exchangeCode.mockResolvedValue(tokens());
    fake.userId.mockResolvedValue(4242);
    const res = await callback(`code=code-1&state=${state}`);
    expect(res.headers.location).toMatch(/#erreur=compte_deja_relie$/);
  });

  it('erreur côté Wahoo à l’échange : message court, pas de connexion', async () => {
    const { state } = await startConnect('token-b');
    fake.exchangeCode.mockRejectedValue(new Error('boom'));
    const res = await callback(`code=code-1&state=${state}`);
    expect(res.headers.location).toMatch(/#erreur=echange_refuse$/);
    expect(await rows('device_connections')).toEqual([]);
  });
});

describe('état et déconnexion', () => {
  it('l’athlète et son coach voient l’état ; un athlète hors équipe reçoit 404', async () => {
    await linkCoach(USER_A, USER_B);
    await seedConnection(USER_B);

    const own = await app.inject({ method: 'GET', url: '/api/athletes/iB/devices', headers: auth('token-b') });
    expect(own.statusCode).toBe(200);
    const coach = await app.inject({ method: 'GET', url: '/api/athletes/iB/devices', headers: auth('token-a') });
    expect(coach.statusCode).toBe(200);
    const list = coach.json() as Array<{ provider: string; direct: boolean; connected: boolean; lastError: string | null }>;
    expect(list.find((d) => d.provider === 'wahoo')).toMatchObject({ direct: true, connected: true, lastError: null });
    expect(list.find((d) => d.provider === 'garmin')).toMatchObject({ direct: false, connected: false });
    expect(JSON.stringify(list)).not.toMatch(/access|refresh/);

    // Hors équipe : 404 (pas 403).
    const other = await app.inject({ method: 'GET', url: '/api/athletes/iA/devices', headers: auth('token-b') });
    expect(other.statusCode).toBe(404);
    const unknown = await app.inject({ method: 'GET', url: '/api/athletes/iZ/devices', headers: auth('token-a') });
    expect(unknown.statusCode).toBe(404);
  });

  it('identifiant d’athlète invalide : 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/athletes/x%20y/devices', headers: auth('token-a') });
    expect(res.statusCode).toBe(400);
  });

  it('déconnexion : la connexion disparaît', async () => {
    await seedConnection(USER_B);
    const res = await app.inject({ method: 'DELETE', url: '/api/devices/wahoo', headers: auth('token-b') });
    expect(res.statusCode).toBe(200);
    expect(await rows('device_connections')).toEqual([]);
  });
});

describe('webhook Wahoo', () => {
  const summary = {
    id: 777,
    power_avg: '198',
    power_bike_np_last: '230',
    duration_active_accum: '2700',
    distance_accum: '30000',
    workout: { id: 5, starts: '2026-12-01T08:00:00Z', name: 'Endurance', workout_type_id: 0 },
  };
  const body = (over: Record<string, unknown> = {}) => ({
    event_type: 'workout_summary',
    webhook_token: 'whk-test-token',
    user: { id: 999 },
    workout_summary: summary,
    ...over,
  });
  const post = (payload: unknown) => app.inject({ method: 'POST', url: '/api/public/webhooks/wahoo', payload: payload as Record<string, unknown> });

  it('refuse un jeton absent ou faux', async () => {
    await seedConnection(USER_B);
    expect((await post(body({ webhook_token: undefined }))).statusCode).toBe(401);
    expect((await post(body({ webhook_token: 'faux' }))).statusCode).toBe(401);
    expect(await rows('activities')).toEqual([]);
  });

  it('ignore les événements autres que les résumés, et les comptes non reliés', async () => {
    await seedConnection(USER_B);
    expect((await post(body({ event_type: 'autre' }))).json()).toMatchObject({ ignored: true });
    expect((await post(body({ user: { id: 12345 } }))).json()).toMatchObject({ ignored: true });
  });

  it('enregistre la sortie ; une livraison en double ne crée rien de plus', async () => {
    await seedConnection(USER_B);
    const first = await post(body());
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true, result: 'recue' });
    const second = await post(body());
    expect(second.json()).toMatchObject({ ok: true, result: 'deja_recue' });

    const acts = await rows<{ id: string; source: string }>('activities');
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ id: 'wahoo-777', source: 'wahoo' });
  });
});
