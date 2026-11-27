import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resetDb, setupTestDb } from './helpers.js';

vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

const COACH = { authorization: 'Bearer demo' };

interface Act {
  id: string | number;
  icu_training_load?: number | null;
}

/** Une sortie a la même charge partout : fil, fiche athlète, journée de l'équipe. */
describe('cohérence de la charge entre écrans (mode démo)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await setupTestDb();
    const { buildServer } = await import('../src/server.js');
    app = await buildServer();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await resetDb();
    const { ensureDemoUsers } = await import('../src/db/repo.js');
    const { DEMO_USER, DEMO_ATHLETE } = await import('../src/auth.js');
    await ensureDemoUsers(DEMO_USER, DEMO_ATHLETE);
  });

  it('fil, fiche et journée donnent la même charge pour chaque sortie', async () => {
    const feed = (await app.inject({ method: 'GET', url: '/api/feed', headers: COACH })).json() as {
      items: Array<{ athleteId: string; activity: Act & { start_date_local: string } }>;
    };
    expect(feed.items.length).toBeGreaterThan(0);
    const feedLoad = new Map(feed.items.map((i) => [String(i.activity.id), i.activity.icu_training_load ?? null]));

    const athleteId = feed.items[0].athleteId;
    const overview = (await app.inject({ method: 'GET', url: `/api/athletes/${athleteId}/overview`, headers: COACH })).json() as { activities: Act[] };
    let compared = 0;
    for (const a of overview.activities) {
      if (!feedLoad.has(String(a.id))) continue;
      expect(a.icu_training_load ?? null).toBe(feedLoad.get(String(a.id)));
      compared++;
    }
    expect(compared).toBeGreaterThan(0);

    const day = feed.items[0].activity.start_date_local.slice(0, 10);
    const team = (await app.inject({ method: 'GET', url: `/api/team/today?date=${day}`, headers: COACH })).json() as {
      athletes: Array<{ done: Act[] }>;
    };
    const done = team.athletes.flatMap((x) => x.done).filter((a) => feedLoad.has(String(a.id)));
    expect(done.length).toBeGreaterThan(0);
    for (const a of done) expect(a.icu_training_load ?? null).toBe(feedLoad.get(String(a.id)));
  });
});
