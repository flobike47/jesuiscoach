import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { USER_A, auth, resetDb, rows, setupTestDb } from './helpers.js';

const { exchangeMock } = vi.hoisted(() => {
  process.env.COACH_ATHLETE_IDS = 'i100';
  return { exchangeMock: vi.fn() };
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/intervals.js', async (orig) => ({
  ...(await orig<typeof import('../src/providers/intervals.js')>()),
  exchangeCode: exchangeMock,
}));

let app: FastifyInstance;
let redis: { flushall: () => Promise<unknown> };
beforeAll(async () => {
  await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  ({ redis } = await import('../src/cache.js'));
  app = await buildServer();
});
afterAll(() => app.close());
beforeEach(async () => {
  await redis.flushall();
  await resetDb();
  exchangeMock.mockReset();
});

/** Démarre la connexion et renvoie le state posé dans l'URL d'autorisation. */
async function start(query = '') {
  const res = await app.inject({ method: 'GET', url: `/api/public/auth/intervals/start${query}` });
  expect(res.statusCode).toBe(302);
  const url = new URL(res.headers.location as string);
  return { url, state: url.searchParams.get('state')! };
}

async function callback(state: string, code = 'code-1') {
  const res = await app.inject({ method: 'GET', url: `/api/public/auth/intervals/callback?code=${code}&state=${state}` });
  expect(res.statusCode).toBe(302);
  const location = new URL(res.headers.location as string);
  expect(location.pathname).toBe('/connexion/retour');
  return new URLSearchParams(location.hash.slice(1));
}

const exchange = (code: unknown) => app.inject({ method: 'POST', url: '/api/public/auth/exchange', payload: { code } });

/** Parcours complet : OAuth → code → session. Renvoie le jeton de session. */
async function signIn(athleteId: string, name: string, query = '') {
  exchangeMock.mockResolvedValue({ accessToken: `tok-${athleteId}`, scope: 'ACTIVITY:READ', athleteId, athleteName: name });
  const { state } = await start(query);
  const params = await callback(state);
  const code = params.get('code');
  if (!code) return { error: params.get('error') };
  const res = await exchange(code);
  expect(res.statusCode).toBe(200);
  return { token: res.json().token as string };
}

async function invite(code: string, expiresAt: string) {
  // Insertion directe : la route /api/invitations est testée plus bas
  const { db } = await import('../src/db/index.js');
  await db().query('insert into invitations (code, coach_id, expires_at) values ($1, $2, $3)', [code, USER_A, expiresAt]);
}

describe('connexion Intervals.icu', () => {
  it('redirige vers Intervals.icu avec PKCE S256 et les scopes', async () => {
    const { url } = await start();
    expect(url.origin + url.pathname).toBe('https://intervals.icu/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('test-client');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://api.test/api/public/auth/intervals/callback');
    expect(url.searchParams.get('scope')).toContain('CALENDAR:WRITE');
  });

  it('crée le coach, chiffre son jeton et ouvre une session', async () => {
    const { token } = await signIn('i100', 'Florian');
    const users = await rows('users');
    expect(users.find((u) => u.intervals_athlete_id === 'i100')).toMatchObject({ role: 'coach', name: 'Florian' });
    const [tok] = await rows<{ access_token_enc: string }>('intervals_tokens');
    expect(tok.access_token_enc).not.toContain('tok-i100');
    // La session fonctionne et ne figure pas en clair en base
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.json()).toMatchObject({ role: 'coach', name: 'Florian', athleteId: 'i100' });
    const sessions = await rows<{ token_hash: string }>('sessions');
    expect(sessions.some((s) => s.token_hash === token)).toBe(false);
  });

  it('refuse un inconnu sans invitation', async () => {
    expect(await signIn('i200', 'Julie')).toEqual({ error: 'invitation_requise' });
    expect((await rows('users')).map((u) => u.intervals_athlete_id)).not.toContain('i200');
  });

  it('inscrit un athlète invité et le relie à son coach', async () => {
    await invite('invite-abcdef', new Date(Date.now() + 86_400_000).toISOString());
    const { token } = await signIn('i200', 'Julie', '?invite=invite-abcdef');
    expect(token).toBeTruthy();
    const julie = (await rows<{ id: string; intervals_athlete_id: string; role: string }>('users')).find((u) => u.intervals_athlete_id === 'i200')!;
    expect(julie.role).toBe('athlete');
    expect(await rows('coach_athletes')).toMatchObject([{ coach_id: USER_A, athlete_id: julie.id }]);
    expect((await rows('invitations'))[0].used_by).toBe(julie.id);
    // Le coach voit désormais Julie dans son équipe
    const { teamAthleteIds } = await import('../src/db/repo.js');
    expect(await teamAthleteIds(USER_A)).toEqual(['i200']);
  });

  it('refuse une invitation expirée ou déjà utilisée', async () => {
    await invite('invite-old000', '2020-01-01T00:00:00Z');
    expect(await signIn('i200', 'Julie', '?invite=invite-old000')).toEqual({ error: 'invitation_invalide' });
    await invite('invite-once00', new Date(Date.now() + 86_400_000).toISOString());
    await signIn('i200', 'Julie', '?invite=invite-once00');
    expect(await signIn('i300', 'Paul', '?invite=invite-once00')).toEqual({ error: 'invitation_invalide' });
  });

  it("signale au web la première connexion d'un athlète invité (écran « Bien démarrer »), et seulement elle", async () => {
    const welcome = async (athleteId: string, query = '') => {
      exchangeMock.mockResolvedValue({ accessToken: `tok-${athleteId}`, scope: 'ACTIVITY:READ', athleteId, athleteName: 'X' });
      const { state } = await start(query);
      return (await callback(state)).get('bienvenue');
    };
    await invite('invite-welcome', new Date(Date.now() + 86_400_000).toISOString());
    expect(await welcome('i200', '?invite=invite-welcome')).toBe('1');
    // Reconnexion du même athlète, ou coach : pas d'écran d'accueil.
    expect(await welcome('i200')).toBeNull();
    expect(await welcome('i100')).toBeNull();
  });

  it('retrouve un compte existant sans invitation', async () => {
    await invite('invite-abcdef', new Date(Date.now() + 86_400_000).toISOString());
    await signIn('i200', 'Julie', '?invite=invite-abcdef');
    const again = await signIn('i200', 'Julie M.');
    expect(again.token).toBeTruthy();
    expect((await rows('users')).find((u) => u.intervals_athlete_id === 'i200')?.name).toBe('Julie M.');
  });

  it('refuse un state inconnu ou rejoué', async () => {
    exchangeMock.mockResolvedValue({ accessToken: 't', scope: '', athleteId: 'i100' });
    expect((await callback('inconnu')).get('error')).toBe('session_expiree');
    const { state } = await start();
    await callback(state);
    expect((await callback(state)).get('error')).toBe('session_expiree');
  });

  it("signale un échange de code refusé par Intervals.icu", async () => {
    exchangeMock.mockRejectedValue(new Error('invalid_grant'));
    const { state } = await start();
    expect((await callback(state)).get('error')).toBe('echange_refuse');
  });

  it('refuse un code de connexion inconnu, invalide ou déjà échangé', async () => {
    expect((await exchange('x')).statusCode).toBe(400);
    expect((await exchange('a'.repeat(32))).statusCode).toBe(401);
    exchangeMock.mockResolvedValue({ accessToken: 't', scope: '', athleteId: 'i100', athleteName: 'Florian' });
    const { state } = await start();
    const code = (await callback(state)).get('code')!;
    expect((await exchange(code)).statusCode).toBe(200);
    expect((await exchange(code)).statusCode).toBe(401);
  });
});

describe('sessions', () => {
  it('refuse une session absente ou expirée', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer nimporte-quoi' } })).statusCode).toBe(401);
    const { db } = await import('../src/db/index.js');
    await db().query(`update sessions set expires_at = now() - interval '1 minute'`);
    await redis.flushall();
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: auth('token-a') })).statusCode).toBe(401);
  });

  it('déconnecte et révoque la session', async () => {
    const { token } = await signIn('i100', 'Florian');
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers })).statusCode).toBe(401);
  });

  it('refuse le jeton démo hors mode démo', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer demo' } })).statusCode).toBe(401);
  });
});

describe('équipe hors démo', () => {
  it("cache au coach un athlète qui n'est pas dans son équipe", async () => {
    const res = await app.inject({ method: 'GET', url: '/api/athletes/iB/overview', headers: auth('token-a') });
    expect(res.statusCode).toBe(404);
  });

  it('réserve le tableau équipe et les invitations au coach', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/team', headers: auth('token-b') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/invitations', headers: auth('token-b') })).statusCode).toBe(403);
  });

  it('crée une invitation valable 7 jours', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/invitations', headers: auth('token-a') });
    expect(res.statusCode).toBe(200);
    const { code, url } = res.json();
    expect(url).toBe(`http://localhost:5173/connexion?invitation=${code}`);
    expect(await rows('invitations')).toMatchObject([{ code, coach_id: USER_A }]);
  });
});
