import type { FastifyBaseLogger } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { redis } from '../src/cache.js';
import { db } from '../src/db/index.js';
import { dbContext, storeSyncedActivities, summaryOf } from '../src/activityStore.js';
import { syncTargets, type SyncTarget } from '../src/db/repo.js';
import { DAILY_STREAMS, backfillAthlete, takeStreamBudget } from '../src/jobs/backfill.js';
import type { AthleteSource } from '../src/sources.js';
import type { IntervalsActivity, IntervalsAthlete, IntervalsStream } from '../src/types.js';
import { USER_B, resetDb, rows, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

const NOW = new Date('2026-11-24T18:00:00Z');
const log = { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as FastifyBaseLogger;

function hourStreams(): IntervalsStream[] {
  const time = Array.from({ length: 3600 }, (_, i) => i);
  return [
    { type: 'time', data: time },
    { type: 'watts', data: time.map(() => 200) },
  ];
}

const ride = (id: string, day: string): IntervalsActivity => ({ id, start_date_local: `${day}T09:00:00`, type: 'Ride', name: 'Sortie', moving_time: 3600, distance: 40_000 });

const INFO: IntervalsAthlete = { id: 'iB', sportSettings: [{ types: ['Ride'], ftp: 250 }] };

function fakeSource(activities: IntervalsActivity[] = []) {
  const rawStreams = vi.fn(async () => hourStreams());
  const activitiesFn = vi.fn(async () => activities);
  const source = { athlete: async () => INFO, activities: activitiesFn, rawStreams } as unknown as AthleteSource;
  return { source, rawStreams, activitiesFn };
}

let target: SyncTarget;

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
  await redis.flushall();
  // B est connecté à Intervals.icu : c'est une cible de synchro.
  await db().query(`insert into intervals_tokens (user_id, access_token_enc) values ($1, 'x')`, [USER_B]);
  target = (await syncTargets()).find((t) => t.id === USER_B)!;
});

describe('budget de récupération des courbes', () => {
  it(`accorde ${DAILY_STREAMS} récupérations par athlète et par jour, puis refuse`, async () => {
    for (let i = 0; i < DAILY_STREAMS; i++) expect(await takeStreamBudget(USER_B, '2026-11-24')).toBe(true);
    expect(await takeStreamBudget(USER_B, '2026-11-24')).toBe(false);
    // Le lendemain, le compteur repart.
    expect(await takeStreamBudget(USER_B, '2026-11-25')).toBe(true);
  });
});

describe('rattrapage', () => {
  it('récupère au plus 10 courbes par jour, les plus récentes d’abord', async () => {
    const acts = Array.from({ length: 12 }, (_, i) => ride(`r${i}`, `2026-11-${String(10 + i).padStart(2, '0')}`));
    await dbContext(USER_B).backend.upsert(acts.flatMap(summaryOf));
    const { source, rawStreams } = fakeSource();

    const first = await backfillAthlete(target, source, log, NOW);
    expect(rawStreams).toHaveBeenCalledTimes(DAILY_STREAMS);
    expect(first.streams).toBe(DAILY_STREAMS);
    // La plus récente (r11, le 21) est traitée en premier.
    expect(rawStreams.mock.calls[0]).toEqual(['iB', 'r11']);

    // Même jour : budget épuisé, aucun appel de plus.
    await backfillAthlete(target, source, log, NOW);
    expect(rawStreams).toHaveBeenCalledTimes(DAILY_STREAMS);

    // Le lendemain, les deux restantes.
    await backfillAthlete(target, source, log, new Date(NOW.getTime() + 24 * 3600 * 1000));
    expect(rawStreams).toHaveBeenCalledTimes(12);
    const { rows: missing } = await db().query<{ n: string }>(`select count(*) as n from activities where streams_status = 'missing'`);
    expect(Number(missing[0].n)).toBe(0);
  });

  it("copie les résumés des 90 derniers jours quand aucune sortie n'est en base, une fois par fenêtre", async () => {
    const { source, activitiesFn } = fakeSource([ride('x1', '2026-11-20')]);
    const first = await backfillAthlete(target, source, log, NOW);
    expect(first.summaries).toBe(1);
    expect(activitiesFn).toHaveBeenCalledWith('iB', '2026-08-26', '2026-11-24');
    await backfillAthlete(target, source, log, NOW);
    expect(activitiesFn).toHaveBeenCalledTimes(1);
  });

  it('recalcule les sorties quand la FTP de la fiche change, sans appel à Intervals.icu', async () => {
    // Première calcul avec la FTP d'Intervals.icu (250 W).
    const { source, rawStreams } = fakeSource();
    await storeSyncedActivities(dbContext(USER_B), 'iB', source, [ride('f1', '2026-11-24')], new Set(['f1']), () => undefined);
    expect(rawStreams).toHaveBeenCalledTimes(1);

    // La fiche de l'app indique 200 W.
    await db().query(`insert into athlete_profile (user_id) values ($1)`, [USER_B]);
    await db().query(`insert into athlete_physiology (user_id, sport, ftp, updated_by) values ($1, 'Ride', 200, 'athlete')`, [USER_B]);

    const r = await backfillAthlete(target, source, log, NOW);
    expect(r.recomputed).toBe(1);
    expect(rawStreams).toHaveBeenCalledTimes(1);
    const [row] = await rows<{ ftp_used: number; intensity: string }>('activities');
    expect(row.ftp_used).toBe(200);
    expect(Number(row.intensity)).toBe(1);
  });
});
