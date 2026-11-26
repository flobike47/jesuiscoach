import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { USER_A, USER_B, resetDb, rows, setupTestDb } from './helpers.js';

/** Client Wahoo simulé : aucun appel réseau. */
const { fake } = vi.hoisted(() => {
  process.env.WAHOO_CLIENT_ID = 'wahoo-test';
  process.env.WAHOO_CLIENT_SECRET = 'wahoo-secret';
  process.env.WAHOO_WEBHOOK_TOKEN = 'whk-test-token';
  return {
    fake: {
      refresh: vi.fn(),
      exchangeCode: vi.fn(),
      userId: vi.fn(),
      revoke: vi.fn(),
      createPlan: vi.fn(),
      updatePlan: vi.fn(),
      deletePlan: vi.fn(),
      createWorkout: vi.fn(),
    },
  };
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

vi.mock('../src/devices/wahoo.js', async (orig) => {
  const real = await orig<typeof import('../src/devices/wahoo.js')>();
  class FakeWahooClient {
    refresh = (...a: unknown[]) => fake.refresh(...a);
    exchangeCode = (...a: unknown[]) => fake.exchangeCode(...a);
    userId = (...a: unknown[]) => fake.userId(...a);
    revoke = (...a: unknown[]) => fake.revoke(...a);
    createPlan = (...a: unknown[]) => fake.createPlan(...a);
    updatePlan = (...a: unknown[]) => fake.updatePlan(...a);
    deletePlan = (...a: unknown[]) => fake.deletePlan(...a);
    createWorkout = (...a: unknown[]) => fake.createWorkout(...a);
  }
  return { ...real, WahooClient: FakeWahooClient };
});

const { config } = await import('../src/config.js');
const { decrypt, encrypt, parseKey } = await import('../src/lib/crypto.js');
const { ProviderError } = await import('../src/providers/http.js');
const { db } = await import('../src/db/index.js');
const { linkCoachAthlete } = await import('../src/db/repo.js');
const devices = await import('../src/db/deviceRepo.js');
const svc = await import('../src/devices/service.js');

const key = () => parseKey(config.tokenEncryptionKey!);
/** Requête SQL libre (les tests de lignes utilisent `rows` pour une table entière). */
const q = async <T = Record<string, unknown>>(sql: string) => (await db().query<T>(sql)).rows;
/** Mardi 1er décembre 2026, 11 h à Paris. Fenêtre d'envoi : 1er au 7 décembre. */
const NOW = new Date('2026-12-01T10:00:00Z');
const log = { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as FastifyBaseLogger;

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
  for (const f of Object.values(fake)) f.mockReset();
  fake.createPlan.mockResolvedValue('plan-1');
  fake.createWorkout.mockResolvedValue('wk-1');
  fake.updatePlan.mockResolvedValue(undefined);
  fake.deletePlan.mockResolvedValue(undefined);
  fake.revoke.mockResolvedValue(undefined);
});

/** Relie l'athlète B à Wahoo avec un jeton valable (ou presque expiré si `expiresInMs` est court). */
async function connect(userId = USER_B, expiresInMs = 2 * 60 * 60 * 1000) {
  await devices.saveConnection(userId, 'wahoo', {
    externalUserId: '999',
    accessEnc: encrypt('access-old', key()),
    refreshEnc: encrypt('refresh-old', key()),
    expiresAt: new Date(Date.now() + expiresInMs),
    scope: 'user_read',
  });
}

/** Fiche profil : FTP vélo 245 W (sinon la conversion est refusée). */
async function profileWithFtp(userId = USER_B, ftp = 245) {
  await db().query(`insert into athlete_profile (user_id) values ($1)`, [userId]);
  await db().query(`insert into athlete_physiology (user_id, sport, ftp) values ($1, 'Ride', $2)`, [userId, ftp]);
}

async function addWorkout(day: string, description: string, sport: 'Ride' | 'Run' | 'Swim' = 'Ride', origin = 'app'): Promise<string> {
  const { rows: r } = await db().query<{ id: string }>(
    `insert into calendar_events (user_id, kind, sport, day, name, description, origin, created_by)
     values ($1, 'workout', $2, $3::date, 'Seuil 3×10', $4, $5, 'coach') returning id`,
    [USER_B, sport, day, description, origin],
  );
  return r[0].id;
}

const event = (id: string, day: string, description: string, sport: 'Ride' | 'Run' | 'Swim' = 'Ride') => ({
  id,
  kind: 'workout' as const,
  origin: 'app' as const,
  sport,
  day,
  name: 'Seuil 3×10',
  description,
});

describe('envoi des séances vers Wahoo', () => {
  it('envoie le plan puis la séance planifiée à 7 h (heure de Paris), dans la fenêtre J..J+6', async () => {
    await connect();
    await profileWithFtp();
    const id = await addWorkout('2026-12-03', '- 10m 70%');

    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW);

    expect(fake.createPlan).toHaveBeenCalledWith('access-old', expect.objectContaining({ externalId: id }));
    expect(fake.createWorkout).toHaveBeenCalledWith(
      'access-old',
      expect.objectContaining({ workoutToken: id, workoutTypeId: 0, starts: '2026-12-03T06:00:00.000Z', minutes: 10, planId: 'plan-1' }),
    );
    const [push] = await rows<{ status: string; plan_id: string; workout_id: string }>('device_pushes');
    expect(push).toMatchObject({ status: 'pushed', plan_id: 'plan-1', workout_id: 'wk-1' });
  });

  it('ne renvoie rien si le contenu n’a pas changé', async () => {
    await connect();
    await profileWithFtp();
    const id = await addWorkout('2026-12-03', '- 10m 70%');
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW);
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW);
    expect(fake.createPlan).toHaveBeenCalledTimes(1);
    expect(fake.createWorkout).toHaveBeenCalledTimes(1);
  });

  it('une modification met le plan à jour sans créer une seconde séance', async () => {
    await connect();
    await profileWithFtp();
    const id = await addWorkout('2026-12-03', '- 10m 70%');
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW);
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 20m 70%'), NOW);
    expect(fake.updatePlan).toHaveBeenCalledWith('access-old', 'plan-1', expect.anything());
    expect(fake.createWorkout).toHaveBeenCalledTimes(1);
  });

  it('une séance après J+6 attend le job : aucun appel', async () => {
    await connect();
    await profileWithFtp();
    const id = await addWorkout('2026-12-10', '- 10m 70%');
    await svc.pushEvent(USER_B, event(id, '2026-12-10', '- 10m 70%'), NOW);
    expect(fake.createPlan).not.toHaveBeenCalled();
    expect(await rows('device_pushes')).toEqual([]);
  });

  it('une séance d’un autre origine (Intervals.icu) n’est pas envoyée', async () => {
    await connect();
    await profileWithFtp();
    const id = await addWorkout('2026-12-03', '- 10m 70%', 'Ride', 'intervals');
    await svc.pushEvent(USER_B, { ...event(id, '2026-12-03', '- 10m 70%'), origin: 'intervals' }, NOW);
    expect(fake.createPlan).not.toHaveBeenCalled();
  });

  it('natation : enregistrée comme ignorée, sans appel', async () => {
    await connect();
    const id = await addWorkout('2026-12-03', '- 300mtr 70% Pace', 'Swim');
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 300mtr 70% Pace', 'Swim'), NOW);
    expect(fake.createPlan).not.toHaveBeenCalled();
    const [push] = await rows<{ status: string; error: string }>('device_pushes');
    expect(push).toMatchObject({ status: 'skipped', error: 'natation non prise en charge' });
  });

  it('séance non convertible (zone Z2) : ignorée avec la raison, la séance reste au calendrier', async () => {
    await connect();
    await profileWithFtp();
    const id = await addWorkout('2026-12-03', '- 60m Z2');
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 60m Z2'), NOW);
    expect(fake.createPlan).not.toHaveBeenCalled();
    const [push] = await rows<{ status: string; error: string }>('device_pushes');
    expect(push.status).toBe('skipped');
    expect(push.error).toContain('ligne non prise en charge');
    expect(await rows('calendar_events')).toHaveLength(1);
  });

  it('erreur Wahoo : enregistrée en erreur, sans bloquer', async () => {
    await connect();
    await profileWithFtp();
    fake.createPlan.mockRejectedValue(new ProviderError('Plan refusé', 422, 'Wahoo'));
    const id = await addWorkout('2026-12-03', '- 10m 70%');
    await expect(svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW)).resolves.toBeUndefined();
    const [push] = await rows<{ status: string; error: string }>('device_pushes');
    expect(push).toMatchObject({ status: 'error', error: 'Plan refusé' });
    expect(await rows('calendar_events')).toHaveLength(1);
  });

  it('401 de Wahoo : la reconnexion est demandée à l’athlète', async () => {
    await connect();
    await profileWithFtp();
    fake.createPlan.mockRejectedValue(new ProviderError('Non autorisé', 401, 'Wahoo'));
    const id = await addWorkout('2026-12-03', '- 10m 70%');
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW);
    const [conn] = await rows<{ last_error: string }>('device_connections');
    expect(conn.last_error).toBe('Reconnexion Wahoo nécessaire');
  });

  it('jeton proche de l’expiration : rafraîchi, le nouveau couple est enregistré avant l’appel', async () => {
    await connect(USER_B, 60 * 1000);
    await profileWithFtp();
    fake.refresh.mockResolvedValue({ accessToken: 'access-new', refreshToken: 'refresh-new', expiresAt: new Date(Date.now() + 7200_000), scope: '' });
    let savedRefresh = '';
    fake.createPlan.mockImplementation(async () => {
      const c = await devices.connectionOf(USER_B, 'wahoo');
      savedRefresh = decrypt(c!.refreshEnc, key());
      return 'plan-1';
    });
    const id = await addWorkout('2026-12-03', '- 10m 70%');
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW);

    expect(fake.refresh).toHaveBeenCalledWith('refresh-old');
    expect(savedRefresh).toBe('refresh-new');
    expect(fake.createPlan).toHaveBeenCalledWith('access-new', expect.anything());
  });

  it('les jetons ne sont jamais stockés en clair', async () => {
    await connect();
    const [conn] = await rows<{ access_token_enc: string; refresh_token_enc: string }>('device_connections');
    expect(conn.access_token_enc).not.toContain('access-old');
    expect(conn.refresh_token_enc).not.toContain('refresh-old');
  });

  it('retrait : supprime le plan du compteur et la ligne de suivi', async () => {
    await connect();
    await profileWithFtp();
    const id = await addWorkout('2026-12-03', '- 10m 70%');
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW);
    await svc.removePushed(USER_B, id);
    expect(fake.deletePlan).toHaveBeenCalledWith('access-old', 'plan-1');
    expect(await rows('device_pushes')).toEqual([]);
  });

  it('sans connexion Wahoo : aucun effet', async () => {
    await profileWithFtp();
    const id = await addWorkout('2026-12-03', '- 10m 70%');
    await svc.pushEvent(USER_B, event(id, '2026-12-03', '- 10m 70%'), NOW);
    expect(fake.createPlan).not.toHaveBeenCalled();
  });

  it('pushDue envoie les séances de la fenêtre seulement', async () => {
    await connect();
    await profileWithFtp();
    await addWorkout('2026-12-03', '- 10m 70%');
    await addWorkout('2026-12-20', '- 10m 70%');
    expect(await svc.pushDue(USER_B, NOW)).toBe(1);
    expect(fake.createPlan).toHaveBeenCalledTimes(1);
  });
});

describe('réception des sorties Wahoo', () => {
  const summary = {
    id: 555,
    power_avg: '200.4',
    power_bike_np_last: '245.0',
    heart_rate_avg: '150.2',
    distance_accum: '40000.0',
    duration_active_accum: '3600',
    ascent_accum: '320.5',
    cadence_avg: '90',
    workout: { id: 1, starts: '2026-12-01T08:00:00Z', name: 'Sortie du matin', workout_type_id: 0 },
  };

  it('enregistre la sortie, calcule la charge, notifie le coach une seule fois', async () => {
    await profileWithFtp();
    await linkCoachAthlete(USER_A, USER_B);
    const notify = vi.fn().mockResolvedValue(undefined);

    expect(await svc.receiveWahooSummary(USER_B, summary, log, notify)).toBe('recue');
    expect(await svc.receiveWahooSummary(USER_B, summary, log, notify)).toBe('deja_recue');

    const [row] = await q<{ id: string; source: string; start_local: string; distance_m: string; load: string; load_method: string; streams_status: string }>(
      `select id, source, start_local, distance_m, load, load_method, streams_status from activities`,
    );
    expect(row).toMatchObject({ id: 'wahoo-555', source: 'wahoo', start_local: '2026-12-01T09:00:00', load_method: 'power', streams_status: 'none' });
    expect(Number(row.load)).toBe(100);
    expect(Number(row.distance_m)).toBe(40000);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toEqual([USER_A]);
  });

  it('sans puissance : pas de charge (méthode none)', async () => {
    await profileWithFtp();
    const { power_bike_np_last: _omit, ...noPower } = summary;
    expect(await svc.receiveWahooSummary(USER_B, { ...noPower, id: 556 }, log, vi.fn())).toBe('recue');
    const [row] = await q<{ load: string | null; load_method: string }>(`select load, load_method from activities where id = 'wahoo-556'`);
    expect(row).toMatchObject({ load: null, load_method: 'none' });
  });

  it('doublon : une sortie Intervals.icu qui démarre à moins de 3 min n’est pas recopiée', async () => {
    await db().query(
      `insert into activities (user_id, id, source, start_utc, start_local) values ($1, 'i-1', 'intervals', '2026-12-01T08:01:00Z', '2026-12-01T09:01:00')`,
      [USER_B],
    );
    expect(await svc.receiveWahooSummary(USER_B, summary, log, vi.fn())).toBe('doublon');
    expect(await q(`select id from activities where id = 'wahoo-555'`)).toEqual([]);
  });

  it('résumé sans date de départ : ignoré', async () => {
    const { workout: _w, ...noStart } = summary;
    expect(await svc.receiveWahooSummary(USER_B, { ...noStart, id: 9 }, log, vi.fn())).toBe('ignoree');
  });
});
