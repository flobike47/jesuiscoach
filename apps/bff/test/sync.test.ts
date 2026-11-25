import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/index.js';
import { syncTargets, type SyncTarget } from '../src/db/repo.js';
import { syncAthlete, type Notify } from '../src/jobs/sync.js';
import type { AthleteSource } from '../src/sources.js';
import type { IntervalsActivity } from '../src/types.js';
import { USER_A, USER_B, resetDb, rows, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

const NOW = new Date('2026-11-24T18:00:00Z');

function ride(id: string, day: string, extra: Partial<IntervalsActivity> = {}): IntervalsActivity {
  return { id, start_date_local: `${day}T09:00:00`, type: 'Ride', name: 'Seuil 3×10', moving_time: 5520, distance: 48_000, icu_training_load: 96, ...extra };
}

const unused = async (): Promise<never> => {
  throw new Error('non utilisé');
};

/** Source factice : sorties modifiables, forme et calendrier fixes. */
function fakeSource(activities: IntervalsActivity[], form = { ctl: 60, atl: 65 }): AthleteSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    athlete: async (id) => (calls.push('athlete'), { id, name: 'Athlète B' }),
    wellness: async () => (calls.push('wellness'), [{ id: '2026-11-24', ctl: form.ctl, atl: form.atl, rampRate: 2 }]),
    activities: async () => (calls.push('activities'), activities),
    events: async () => (calls.push('events'), []),
    createWorkout: unused,
    moveEvent: unused,
    deleteEvent: unused,
  };
}

let db: Db;
let notify: ReturnType<typeof vi.fn> & Notify;

beforeAll(async () => {
  db = await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
  // B est connecté à Intervals.icu et coaché par A
  await db.query(`insert into intervals_tokens (user_id, access_token_enc) values ($1, 'x')`, [USER_B]);
  await db.query('insert into coach_athletes (coach_id, athlete_id) values ($1, $2)', [USER_A, USER_B]);
  notify = vi.fn(async () => undefined) as never;
});

async function targetB(): Promise<SyncTarget> {
  return (await syncTargets()).find((t) => t.id === USER_B)!;
}

describe('synchro des sorties', () => {
  it("ne liste que les athlètes connectés à Intervals.icu", async () => {
    expect((await syncTargets()).map((t) => t.id)).toEqual([USER_B]);
  });

  it("mémorise l'historique à la première synchro sans notifier", async () => {
    const n = await syncAthlete(await targetB(), fakeSource([ride('a1', '2026-11-23'), ride('a2', '2026-11-24')]), notify, NOW);
    expect(n).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    expect(await rows('seen_activities')).toHaveLength(2);
    expect((await targetB()).initialized).toBe(true);
  });

  it('notifie le coach une seule fois par nouvelle sortie', async () => {
    await syncAthlete(await targetB(), fakeSource([ride('a1', '2026-11-23')]), notify, NOW);
    const source = fakeSource([ride('a1', '2026-11-23'), ride('a2', '2026-11-24')]);
    expect(await syncAthlete(await targetB(), source, notify, NOW)).toBe(1);
    expect(notify).toHaveBeenCalledWith([USER_A], {
      title: 'Athlète B a terminé Seuil 3×10',
      body: '1:32 · 48 km · charge 96',
      url: 'athletes/iB',
      tag: 'ride-a2',
    });
    // Passage suivant, rien de neuf : aucune notification ni lecture de forme
    notify.mockClear();
    const again = fakeSource([ride('a1', '2026-11-23'), ride('a2', '2026-11-24')]);
    expect(await syncAthlete(await targetB(), again, notify, NOW)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    expect(again.calls).toEqual(['activities']);
  });

  it('ne notifie pas deux fois la même sortie sur deux synchros simultanées', async () => {
    await syncAthlete(await targetB(), fakeSource([]), notify, NOW);
    const target = await targetB();
    const activities = [ride('a9', '2026-11-24')];
    await Promise.all([syncAthlete(target, fakeSource(activities), notify, NOW), syncAthlete(target, fakeSource(activities), notify, NOW)]);
    expect(notify.mock.calls.filter(([, p]) => p.tag === 'ride-a9')).toHaveLength(1);
  });

  it('notifie une alerte de fatigue quand elle apparaît, une seule fois', async () => {
    await syncAthlete(await targetB(), fakeSource([ride('a1', '2026-11-23')]), notify, NOW);
    const tired = (acts: IntervalsActivity[]) => fakeSource(acts, { ctl: 60, atl: 100 });
    await syncAthlete(await targetB(), tired([ride('a1', '2026-11-23'), ride('a2', '2026-11-24')]), notify, NOW);
    const alertCalls = () => notify.mock.calls.filter(([, p]) => p.tag.startsWith('alert-'));
    expect(alertCalls()).toHaveLength(1);
    expect(alertCalls()[0][1]).toMatchObject({ title: 'Athlète B : à surveiller', body: 'Fatigue élevée (forme −40)' });
    // Toujours fatigué à la sortie suivante : pas de nouvelle alerte
    await syncAthlete(await targetB(), tired([ride('a2', '2026-11-24'), ride('a3', '2026-11-24')]), notify, NOW);
    expect(alertCalls()).toHaveLength(1);
  });

  it("notifie l'inactivité qui apparaît, sans lire la forme", async () => {
    await syncAthlete(await targetB(), fakeSource([ride('a1', '2026-11-20')]), notify, NOW);
    // Une semaine plus tard, toujours rien de neuf
    const later = new Date('2026-11-27T18:00:00Z');
    const source = fakeSource([ride('a1', '2026-11-20')]);
    await syncAthlete(await targetB(), source, notify, later);
    expect(source.calls).toEqual(['activities']);
    expect(notify).toHaveBeenCalledWith([USER_A], expect.objectContaining({ title: 'Athlète B : inactif', body: 'Aucune sortie depuis 7 jours' }));
  });

  it("n'envoie rien si l'athlète n'a pas de coach", async () => {
    await db.query('delete from coach_athletes');
    await syncAthlete(await targetB(), fakeSource([]), notify, NOW);
    await syncAthlete(await targetB(), fakeSource([ride('a5', '2026-11-24')]), notify, NOW);
    expect(notify).not.toHaveBeenCalled();
  });
});
