import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import type { AthleteSource } from '../src/sources.js';
import type { IntervalsActivity } from '../src/types.js';
import { USER_A, USER_B, resetDb, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

const { source } = vi.hoisted(() => ({ source: { activities: [] as IntervalsActivity[], calls: 0 } }));

/** Source factice : jamais d'appel à Intervals.icu. */
vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async (): Promise<AthleteSource> => ({
    athlete: async (id) => ({ id, name: 'Athlète B' }),
    wellness: async () => [{ id: '2026-11-24', ctl: 60, atl: 62, rampRate: 2 }],
    activities: async () => (source.calls++, source.activities),
    events: async () => [],
    createWorkout: async () => ({ start_date_local: '' }),
    moveEvent: async () => ({ start_date_local: '' }),
    deleteEvent: async () => undefined,
    activity: async () => ({ id: 'x', start_date_local: '' }),
    streams: async () => ({ step: 1, time: [], watts: null, heartrate: null }),
    powerCurves: async () => ({ list: [] }),
    folders: async () => [],
  }),
}));

const { handleWebhookEvents, parseEvents } = await import('../src/jobs/webhook.js');
const { linkCoachAthlete, recordSync, saveIntervalsToken } = await import('../src/db/repo.js');
const { redis } = await import('../src/cache.js');

const log = { info: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger;

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await redis.flushall();
  await resetDb();
  source.activities = [];
  source.calls = 0;
  // B connecté, déjà synchronisé une fois, coaché par A.
  await saveIntervalsToken(USER_B, 'jeton-chiffre', 'ACTIVITY:READ');
  await linkCoachAthlete(USER_A, USER_B);
  await recordSync(USER_B, null);
});

describe('parseEvents', () => {
  it('garde les événements connus avec un identifiant valide', () => {
    expect(
      parseEvents({
        secret: 'x',
        events: [
          { athlete_id: 'iB', type: 'ACTIVITY_ANALYZED', activity: {} },
          { athlete_id: 42, type: 'CALENDAR_UPDATED' },
          { athlete_id: 'iB', type: 'INCONNU' },
          { athlete_id: 'i B;--', type: 'ACTIVITY_ANALYZED' },
          null,
        ],
      }),
    ).toEqual([
      { athleteId: 'iB', type: 'ACTIVITY_ANALYZED' },
      { athleteId: '42', type: 'CALENDAR_UPDATED' },
    ]);
  });

  it('renvoie une liste vide sur un corps inattendu, et borne la taille', () => {
    expect(parseEvents(null)).toEqual([]);
    expect(parseEvents({ events: 'non' })).toEqual([]);
    const many = Array.from({ length: 500 }, () => ({ athlete_id: 'iB', type: 'CALENDAR_UPDATED' }));
    expect(parseEvents({ events: many })).toHaveLength(100);
  });
});

describe('handleWebhookEvents', () => {
  it('regroupe une rafale en une synchro qui relit les sorties et prévient le coach', async () => {
    const runs: Array<{ run: () => Promise<void>; ms: number }> = [];
    const notify = vi.fn(async () => undefined);
    await redis.set('icu:activities:iB:2026-11-16:2026-11-24', '[]');

    await handleWebhookEvents(
      [
        { athleteId: 'iB', type: 'ACTIVITY_UPLOADED' },
        { athleteId: 'iB', type: 'ACTIVITY_ANALYZED' },
      ],
      { log, notify, schedule: (run, ms) => runs.push({ run, ms }) },
    );
    expect(runs).toHaveLength(1);
    // Sortie tout juste importée : on attend son analyse.
    expect(runs[0].ms).toBe(90_000);

    source.activities = [{ id: 'a1', start_date_local: '2026-11-24T09:00:00', type: 'Ride', name: 'Endurance', moving_time: 3600, distance: 30_000 }];
    await runs[0].run();

    expect(await redis.get('icu:activities:iB:2026-11-16:2026-11-24')).toBeNull();
    expect(source.calls).toBe(1);
    expect(notify).toHaveBeenCalledWith([USER_A], expect.objectContaining({ title: 'Athlète B a terminé Endurance' }));

    // La synchro faite, un nouvel événement peut en programmer une autre.
    await handleWebhookEvents([{ athleteId: 'iB', type: 'ACTIVITY_ANALYZED' }], { log, notify, schedule: (run, ms) => runs.push({ run, ms }) });
    expect(runs).toHaveLength(2);
    expect(runs[1].ms).toBe(5_000);
  });

  it('ignore un athlète inconnu de l’app', async () => {
    const runs: Array<() => Promise<void>> = [];
    const notify = vi.fn(async () => undefined);
    await handleWebhookEvents([{ athleteId: 'iZ', type: 'ACTIVITY_ANALYZED' }], { log, notify, schedule: (run) => runs.push(run) });
    await runs[0]();
    expect(source.calls).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('vide le cache du calendrier ou du profil sans lancer de synchro', async () => {
    const schedule = vi.fn();
    await redis.set('icu:events:iB:a:b', '[]');
    await redis.set('icu:athlete:iB:', '{}');
    await redis.set('icu:events:iA:a:b', '[]');
    await redis.set('icu:activities:iB:a:b', '[]');

    await handleWebhookEvents([{ athleteId: 'iB', type: 'CALENDAR_UPDATED' }], { log, schedule });
    expect(await redis.get('icu:events:iB:a:b')).toBeNull();
    expect(await redis.get('icu:events:iA:a:b')).toBe('[]');
    expect(await redis.get('icu:activities:iB:a:b')).toBe('[]');
    expect(await redis.get('icu:athlete:iB:')).toBe('{}');

    await handleWebhookEvents([{ athleteId: 'iB', type: 'SPORT_SETTINGS_UPDATED' }], { log, schedule });
    expect(await redis.get('icu:athlete:iB:')).toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });
});
