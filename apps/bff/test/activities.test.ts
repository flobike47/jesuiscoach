import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbContext, recomputeStored, storeSyncedActivities, type StoreContext } from '../src/activityStore.js';
import type { AthleteSource } from '../src/sources.js';
import type { IntervalsActivity, IntervalsAthlete, IntervalsStream } from '../src/types.js';
import { USER_A, USER_B, resetDb, rows, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/** Une heure à 250 W et 170 bpm, un point par seconde. */
function hourStreams(): IntervalsStream[] {
  const time = Array.from({ length: 3600 }, (_, i) => i);
  return [
    { type: 'time', data: time },
    { type: 'watts', data: time.map(() => 250) },
    { type: 'heartrate', data: time.map(() => 170) },
  ];
}

const ride = (id: string, day: string): IntervalsActivity => ({ id, start_date_local: `${day}T09:00:00`, start_date: `${day}T08:00:00Z`, type: 'Ride', name: 'Sortie', moving_time: 3600, distance: 40_000, icu_training_load: 90, icu_intensity: 80 });

const INFO: IntervalsAthlete = { id: 'iB', sportSettings: [{ types: ['Ride'], ftp: 250, lthr: 170, max_hr: 190 }] };

/** Source factice : streams d'une heure, compteur d'appels, résultat réglable. */
function fakeSource(streams: () => Promise<IntervalsStream[]> = async () => hourStreams()) {
  const rawStreams = vi.fn(streams);
  const source = {
    athlete: vi.fn(async () => INFO),
    rawStreams,
  } as unknown as AthleteSource;
  return { source, rawStreams };
}

let ctxB: StoreContext;
const noError = () => undefined;

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
  ctxB = dbContext(USER_B);
});

describe('ingestion des sorties', () => {
  it('une sortie nouvelle : courbes lues une fois, stockées, calculées', async () => {
    const { source, rawStreams } = fakeSource();
    await storeSyncedActivities(ctxB, 'iB', source, [ride('a1', '2026-11-24')], new Set(['a1']), noError);

    expect(rawStreams).toHaveBeenCalledTimes(1);
    expect(rawStreams).toHaveBeenCalledWith('iB', 'a1');
    const [row] = await rows<{ streams_status: string; load: string; weighted_watts: number; intensity: string; load_method: string; ftp_used: number }>('activities');
    expect(row).toMatchObject({ streams_status: 'stored', weighted_watts: 250, load_method: 'power', ftp_used: 250 });
    // 3600 s à 250 W avec une FTP de 250 W : charge 100.
    expect(Number(row.load)).toBe(100);
    expect(Number(row.intensity)).toBe(1);
    expect(await rows('activity_streams')).toHaveLength(1);
    expect((await rows('activity_bests')).length).toBeGreaterThan(0);
  });

  it("une sortie sans courbes exploitables passe à « none », sans courbes stockées", async () => {
    const { source } = fakeSource(async () => []);
    await storeSyncedActivities(ctxB, 'iB', source, [ride('a2', '2026-11-24')], new Set(['a2']), noError);
    const [row] = await rows<{ streams_status: string; load: string | null }>('activities');
    expect(row.streams_status).toBe('none');
    expect(row.load).toBeNull();
    expect(await rows('activity_streams')).toHaveLength(0);
  });

  it("une erreur de récupération passe à « error » sans rien lever, et la signale", async () => {
    const { source } = fakeSource(async () => {
      throw new Error('Intervals.icu indisponible');
    });
    const onError = vi.fn();
    await expect(storeSyncedActivities(ctxB, 'iB', source, [ride('a3', '2026-11-24')], new Set(['a3']), onError)).resolves.toBeUndefined();
    const [row] = await rows<{ streams_status: string }>('activities');
    expect(row.streams_status).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("une sortie déjà connue : résumé mis à jour, aucune lecture de courbes", async () => {
    const { source, rawStreams } = fakeSource();
    await storeSyncedActivities(ctxB, 'iB', source, [ride('a4', '2026-11-24')], new Set(['a4']), noError);
    await storeSyncedActivities(ctxB, 'iB', source, [{ ...ride('a4', '2026-11-24'), icu_training_load: 95 }], new Set(), noError);
    expect(rawStreams).toHaveBeenCalledTimes(1);
    const [row] = await rows<{ icu_load: string; streams_status: string }>('activities');
    expect(Number(row.icu_load)).toBe(95);
    expect(row.streams_status).toBe('stored');
  });

  it('recalcule après un changement de FTP, sans appel à Intervals.icu', async () => {
    const { source, rawStreams } = fakeSource();
    await storeSyncedActivities(ctxB, 'iB', source, [ride('a5', '2026-11-24')], new Set(['a5']), noError);
    // FTP passée à 300 W dans la fiche : 3600 × 250 × (250/300) / (300 × 3600) × 100 ≈ 69,4
    const changed = await recomputeStored(ctxB, { Ride: { ftp: 300, lthr: 170, maxHr: 190, restingHr: null, thresholdSpeed: null }, Run: { ftp: 300, lthr: null, maxHr: null, restingHr: null, thresholdSpeed: null }, Swim: { ftp: 300, lthr: null, maxHr: null, restingHr: null, thresholdSpeed: null } });
    expect(changed).toBe(1);
    expect(rawStreams).toHaveBeenCalledTimes(1);
    const [row] = await rows<{ load: string; ftp_used: number }>('activities');
    expect(Number(row.load)).toBeCloseTo(69.4, 1);
    expect(row.ftp_used).toBe(300);
    // Déjà à jour : rien à refaire.
    expect(await recomputeStored(ctxB, { Ride: { ftp: 300, lthr: 170, maxHr: 190, restingHr: null, thresholdSpeed: null }, Run: { ftp: 300, lthr: null, maxHr: null, restingHr: null, thresholdSpeed: null }, Swim: { ftp: 300, lthr: null, maxHr: null, restingHr: null, thresholdSpeed: null } })).toBe(0);
  });

  it("ne lit jamais les sorties d'un autre athlète", async () => {
    const { source } = fakeSource();
    await storeSyncedActivities(ctxB, 'iB', source, [ride('a6', '2026-11-24')], new Set(['a6']), noError);
    const other = dbContext(USER_A);
    expect(await other.backend.list('2026-01-01', '2026-12-31')).toEqual([]);
    expect(await other.backend.get('a6')).toBeNull();
    expect(await ctxB.backend.get('a6')).not.toBeNull();
  });
});
