import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/index.js';
import { USER_A, USER_B, auth, resetDb, rows, setupTestDb } from './helpers.js';

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

/**
 * Intervals.icu factice : un tableau d'événements et d'activités, des appels
 * enregistrés et des pannes programmées. Aucun appel réseau.
 */
interface FakeEvent { id: string; category: string; type?: string; start_date_local: string; name?: string; description?: string }
const { icu } = vi.hoisted(() => ({
  icu: {
    events: [] as FakeEvent[],
    activities: [] as Array<Record<string, unknown>>,
    calls: [] as Array<[string, ...unknown[]]>,
    failNext: '' as '' | 'create' | 'update' | 'delete',
    nextId: 1000,
  },
}));
const notFound = () => Object.assign(new Error('introuvable'), { status: 404 });
const outage = () => new Error('Intervals.icu indisponible');

vi.mock('../src/sources.js', async (orig) => ({
  ...(await orig<typeof import('../src/sources.js')>()),
  sourceFor: async () => ({
    events: async (_id: string, from: string, to: string) => icu.events.filter((e) => e.start_date_local.slice(0, 10) >= from && e.start_date_local.slice(0, 10) <= to),
    activities: async (_id: string, from: string, to: string) => icu.activities.filter((a) => String(a.start_date_local).slice(0, 10) >= from && String(a.start_date_local).slice(0, 10) <= to),
    createEvent: async (_id: string, ev: { category: string; date: string; name: string; description?: string; sport?: string }) => {
      icu.calls.push(['create', ev]);
      if (icu.failNext === 'create') {
        icu.failNext = '';
        throw outage();
      }
      const e: FakeEvent = { id: String(++icu.nextId), category: ev.category, type: ev.sport, start_date_local: `${ev.date}T00:00:00`, name: ev.name, description: ev.description };
      icu.events.push(e);
      return e;
    },
    updateEvent: async (_id: string, eventId: string, patch: Record<string, unknown>) => {
      icu.calls.push(['update', eventId, patch]);
      if (icu.failNext === 'update') {
        icu.failNext = '';
        throw outage();
      }
      const e = icu.events.find((x) => x.id === eventId);
      if (!e) throw notFound();
      if (patch.date) e.start_date_local = `${patch.date}T00:00:00`;
      if (patch.name) e.name = patch.name as string;
      if (patch.category) e.category = patch.category as string;
      if (patch.sport) e.type = patch.sport as string;
      return e;
    },
    deleteEvent: async (_id: string, eventId: string) => {
      icu.calls.push(['delete', eventId]);
      if (icu.failNext === 'delete') {
        icu.failNext = '';
        throw outage();
      }
      const idx = icu.events.findIndex((x) => x.id === eventId);
      if (idx < 0) throw notFound();
      icu.events.splice(idx, 1);
    },
  }),
}));

const ATHLETE_B = 'iB';
const C_USER = '33333333-3333-4333-8333-333333333333';
const C_ATHLETE = 'iC';

let app: FastifyInstance;
let db: Db;
let redis: { flushall: () => Promise<unknown> };

beforeAll(async () => {
  db = await setupTestDb();
  const { buildServer } = await import('../src/server.js');
  ({ redis } = (await import('../src/cache.js')) as never);
  app = await buildServer();
});
afterAll(() => app.close());

beforeEach(async () => {
  await redis.flushall();
  await resetDb();
  icu.events.length = 0;
  icu.activities.length = 0;
  icu.calls.length = 0;
  icu.failNext = '';
  await db.query('insert into coach_athletes (coach_id, athlete_id) values ($1, $2)', [USER_A, USER_B]);
  await db.query(`insert into users (id, intervals_athlete_id, name) values ($1, $2, 'Hors équipe')`, [C_USER, C_ATHLETE]);
});

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: 'token-a' | 'token-b' | null, payload?: unknown) =>
  app.inject({ method, url, headers: token ? auth(token) : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });

const cal = (athlete = ATHLETE_B) => `/api/athletes/${athlete}/calendar`;
const eventsUrl = (athlete = ATHLETE_B) => `/api/athletes/${athlete}/events`;
const pause = () => new Promise((r) => setTimeout(r, 5));

/** Dates relatives à aujourd'hui (Paris) pour que les tests restent valables. */
const T = new Date().toISOString().slice(0, 10);
const FROM = '2000-01-01';
const TO = '2100-01-01';
const addDays = (n: number) => new Date(Date.parse(`${T}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe('calendrier : accès', () => {
  it('exige une session', async () => {
    expect((await call('GET', `${cal()}?from=${FROM}&to=${TO}`, null)).statusCode).toBe(401);
  });

  it('répond 404 pour un athlète hors équipe, et valide la période', async () => {
    expect((await call('GET', `${cal(C_ATHLETE)}?from=${T}&to=${addDays(3)}`, 'token-a')).statusCode).toBe(404);
    expect((await call('POST', eventsUrl(C_ATHLETE), 'token-a', { kind: 'note', date: T, name: 'x' })).statusCode).toBe(404);
    expect((await call('GET', `${cal()}?from=${FROM}&to=${addDays(200)}`, 'token-b')).statusCode).toBe(400);
  });
});

describe('calendrier : écriture recopiée vers Intervals.icu', () => {
  it('crée une séance : ligne en base, événement chez Intervals.icu, identifiant partagé', async () => {
    const res = await call('POST', eventsUrl(), 'token-a', { kind: 'workout', date: addDays(3), name: 'Seuil', sport: 'Ride', description: '- 3x10m 95%' });
    expect(res.statusCode).toBe(201);
    const { event } = res.json();
    expect(event).toMatchObject({ id: '1001', appId: expect.any(String), category: 'WORKOUT', origin: 'app', syncStatus: 'synced' });
    expect(icu.calls[0]).toEqual(['create', expect.objectContaining({ category: 'WORKOUT', date: addDays(3), name: 'Seuil', sport: 'Ride' })]);
    expect(await rows('calendar_events')).toEqual([expect.objectContaining({ intervals_id: '1001', sync_status: 'synced', created_by: 'coach' })]);
  });

  it('crée une compétition A avec la catégorie RACE_A', async () => {
    const res = await call('POST', eventsUrl(), 'token-b', { kind: 'race', date: addDays(40), name: 'Marmotte', racePriority: 'A', raceDistanceM: 175000 });
    expect(res.statusCode).toBe(201);
    expect(res.json().event).toMatchObject({ category: 'RACE_A', racePriority: 'A', raceDistanceM: 175000 });
    expect(icu.calls[0][1]).toMatchObject({ category: 'RACE_A' });
  });

  it("garde la séance en erreur si Intervals.icu est en panne, puis la renvoie", async () => {
    icu.failNext = 'create';
    const res = await call('POST', eventsUrl(), 'token-a', { kind: 'workout', date: addDays(2), name: 'Footing', sport: 'Run' });
    expect(res.statusCode).toBe(201);
    // Une erreur inattendue ne fuit pas son détail : message générique.
    expect(res.json().event).toMatchObject({ syncStatus: 'error', syncError: 'Envoi à Intervals.icu impossible' });
    const appId = res.json().event.appId;

    const resync = await call('POST', `${eventsUrl()}/${appId}/resync`, 'token-a');
    expect(resync.statusCode).toBe(200);
    expect(resync.json().event).toMatchObject({ syncStatus: 'synced', id: expect.any(String) });
    expect(icu.events).toHaveLength(1);
  });

  it('modifie seulement les champs changés chez Intervals.icu', async () => {
    const { event } = (await call('POST', eventsUrl(), 'token-a', { kind: 'workout', date: addDays(2), name: 'Sortie', sport: 'Ride', description: 'a' })).json();
    icu.calls.length = 0;
    const res = await call('PUT', `${eventsUrl()}/${event.id}`, 'token-a', { name: 'Sortie longue' });
    expect(res.statusCode).toBe(200);
    expect(res.json().event).toMatchObject({ name: 'Sortie longue', syncStatus: 'synced' });
    expect(icu.calls).toEqual([['update', event.id, { name: 'Sortie longue' }]]);
  });

  it('déplace une séance (PUT { date }) et ne touche qu’à la date', async () => {
    const { event } = (await call('POST', eventsUrl(), 'token-a', { kind: 'workout', date: addDays(2), name: 'Sortie', sport: 'Ride' })).json();
    icu.calls.length = 0;
    const res = await call('PUT', `${eventsUrl()}/${event.id}`, 'token-a', { date: addDays(5) });
    expect(res.json().event.start_date_local).toBe(`${addDays(5)}T00:00:00`);
    expect(icu.calls).toEqual([['update', event.id, { date: addDays(5) }]]);
  });

  it("supprime chez Intervals.icu puis en base, même si Intervals.icu répond 404", async () => {
    const { event } = (await call('POST', eventsUrl(), 'token-a', { kind: 'note', date: addDays(1), name: 'Repos' })).json();
    icu.events.length = 0; // déjà supprimée là-bas
    const res = await call('DELETE', `${eventsUrl()}/${event.id}`, 'token-a');
    expect(res.json()).toEqual({ ok: true });
    expect(await rows('calendar_events')).toEqual([]);
  });

  it("garde la ligne en erreur si Intervals.icu refuse la suppression", async () => {
    const { event } = (await call('POST', eventsUrl(), 'token-a', { kind: 'note', date: addDays(1), name: 'Repos' })).json();
    icu.failNext = 'delete';
    const res = await call('DELETE', `${eventsUrl()}/${event.id}`, 'token-a');
    expect(res.json()).toMatchObject({ ok: false, syncStatus: 'error' });
    expect(await rows('calendar_events')).toHaveLength(1);
  });
});

describe('calendrier : import et réconciliation à la lecture', () => {
  it('importe un événement créé directement dans Intervals.icu, une seule fois', async () => {
    icu.events.push({ id: '555', category: 'WORKOUT', type: 'Run', start_date_local: `${addDays(4)}T00:00:00`, name: 'Fractionné Intervals' });
    const first = (await call('GET', `${cal()}?from=${addDays(0)}&to=${addDays(10)}`, 'token-b')).json();
    const imported = first.events.find((e: { id: string }) => e.id === '555');
    expect(imported).toMatchObject({ origin: 'intervals', category: 'WORKOUT', syncStatus: 'synced', name: 'Fractionné Intervals' });
    await pause();
    const second = (await call('GET', `${cal()}?from=${addDays(0)}&to=${addDays(10)}`, 'token-b')).json();
    expect(second.events.filter((e: { id: string }) => e.id === '555')).toHaveLength(1);
    expect(await rows('calendar_events')).toHaveLength(1);
  });

  it('retire une ligne importée supprimée chez Intervals.icu, et signale une ligne de l’app supprimée là-bas', async () => {
    icu.events.push({ id: '556', category: 'NOTE', start_date_local: `${addDays(4)}T00:00:00`, name: 'Note importée' });
    await call('GET', `${cal()}?from=${addDays(0)}&to=${addDays(10)}`, 'token-b');
    const { event } = (await call('POST', eventsUrl(), 'token-b', { kind: 'workout', date: addDays(6), name: 'Vélo', sport: 'Ride' })).json();

    icu.events.length = 0; // supprimées chez Intervals.icu
    await pause();
    const res = (await call('GET', `${cal()}?from=${addDays(0)}&to=${addDays(10)}`, 'token-b')).json();
    // La note importée a disparu ; la séance de l'app reste, en erreur.
    expect(res.events).toEqual([expect.objectContaining({ appId: event.appId, syncStatus: 'error' })]);
    expect(await rows('calendar_events')).toEqual([expect.objectContaining({ id: event.appId, sync_status: 'error', sync_error: 'Supprimée dans Intervals.icu' })]);

    // « Renvoyer » recrée l'événement chez Intervals.icu.
    const resync = (await call('POST', `${eventsUrl()}/${event.appId}/resync`, 'token-b')).json();
    expect(resync.event).toMatchObject({ syncStatus: 'synced' });
    expect(icu.events.map((e) => e.name)).toEqual(['Vélo']);
  });

  it('laisse passer les événements d’autres catégories (HOLIDAY) sans les importer', async () => {
    icu.events.push({ id: '557', category: 'HOLIDAY', start_date_local: `${addDays(4)}T00:00:00`, name: 'Vacances' });
    const res = (await call('GET', `${cal()}?from=${addDays(0)}&to=${addDays(10)}`, 'token-b')).json();
    expect(res.events).toEqual([expect.objectContaining({ id: '557', category: 'HOLIDAY' })]);
    expect(await rows('calendar_events')).toEqual([]);
  });

  it('indique les séances faites (appariement inchangé)', async () => {
    icu.events.push({ id: '600', category: 'WORKOUT', type: 'Ride', start_date_local: `${addDays(-1)}T00:00:00`, name: 'Hier' });
    icu.activities.push({ id: 'a1', start_date_local: `${addDays(-1)}T08:00:00`, type: 'Ride', paired_event_id: 600 });
    const res = (await call('GET', `${cal()}?from=${addDays(-3)}&to=${addDays(3)}`, 'token-b')).json();
    expect(res.doneEventIds).toEqual(['600']);
  });
});

describe('vue « Aujourd’hui » du coach', () => {
  it('donne le statut de chaque athlète de l’équipe', async () => {
    icu.events.push({ id: '700', category: 'WORKOUT', type: 'Ride', start_date_local: `${T}T00:00:00`, name: 'Prévue' });
    icu.activities.push({ id: 'b1', start_date_local: `${T}T09:00:00`, type: 'Ride', name: 'Sortie', moving_time: 3600, icu_training_load: 80, paired_event_id: 700 });
    const res = await call('GET', `/api/team/today?date=${T}`, 'token-a');
    expect(res.statusCode).toBe(200);
    const b = res.json().athletes.find((a: { id: string }) => a.id === ATHLETE_B);
    expect(b).toMatchObject({ name: 'Athlète B', status: 'done' });
    expect(b.done).toEqual([{ id: 'b1', name: 'Sortie', type: 'Ride', moving_time: 3600, icu_training_load: 80 }]);
    expect(res.json().athletes.map((a: { id: string }) => a.id)).not.toContain(C_ATHLETE);
  });

  it('marque une séance passée non faite comme manquée, et une sortie sans plan comme extra', async () => {
    icu.events.push({ id: '701', category: 'WORKOUT', type: 'Run', start_date_local: `${addDays(-2)}T00:00:00`, name: 'Oubliée' });
    icu.activities.push({ id: 'c1', start_date_local: `${addDays(-3)}T08:00:00`, type: 'Ride' });
    const missed = (await call('GET', `/api/team/today?date=${addDays(-2)}`, 'token-a')).json().athletes[0];
    expect(missed.status).toBe('missed');
    const extra = (await call('GET', `/api/team/today?date=${addDays(-3)}`, 'token-a')).json().athletes[0];
    expect(extra.status).toBe('extra');
    const rest = (await call('GET', `/api/team/today?date=${addDays(-5)}`, 'token-a')).json().athletes[0];
    expect(rest.status).toBe('rest');
  });

  it('refuse un athlète, et valide la date', async () => {
    expect((await call('GET', `/api/team/today?date=${T}`, 'token-b')).statusCode).toBe(403);
    expect((await call('GET', '/api/team/today?date=demain', 'token-a')).statusCode).toBe(400);
  });
});

describe('objectifs et compétitions', () => {
  const GOAL = { title: 'FTP à 280 W', metric: 'ftp', targetValue: 280, dueDay: addDays(90) };

  it('crée, modifie et supprime un objectif', async () => {
    const created = await call('POST', `/api/athletes/${ATHLETE_B}/goals`, 'token-a', GOAL);
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const put = await call('PUT', `/api/athletes/${ATHLETE_B}/goals/${id}`, 'token-a', { achievedOn: T });
    expect(put.json()).toMatchObject({ title: 'FTP à 280 W', targetValue: 280, achievedOn: T });
    const list = (await call('GET', `/api/athletes/${ATHLETE_B}/goals`, 'token-b')).json();
    expect(list.goals).toEqual([expect.objectContaining({ id, achievedOn: T, createdBy: 'coach' })]);
    expect((await call('DELETE', `/api/athletes/${ATHLETE_B}/goals/${id}`, 'token-a')).statusCode).toBe(200);
    expect((await call('GET', `/api/athletes/${ATHLETE_B}/goals`, 'token-b')).json().goals).toEqual([]);
  });

  it('liste les prochaines compétitions et lie un objectif à une compétition', async () => {
    const race = (await call('POST', eventsUrl(), 'token-a', { kind: 'race', date: addDays(42), name: 'Grand Fond', racePriority: 'A' })).json().event;
    const list = (await call('GET', `/api/athletes/${ATHLETE_B}/goals`, 'token-a')).json();
    expect(list.races).toEqual([expect.objectContaining({ id: race.appId, name: 'Grand Fond', racePriority: 'A' })]);
    const linked = await call('POST', `/api/athletes/${ATHLETE_B}/goals`, 'token-a', { ...GOAL, raceId: race.appId });
    expect(linked.statusCode).toBe(201);
    const unknown = await call('POST', `/api/athletes/${ATHLETE_B}/goals`, 'token-a', { ...GOAL, raceId: '44444444-4444-4444-8444-444444444444' });
    expect(unknown.statusCode).toBe(400);
  });

  it('isole les objectifs : un id d’un autre athlète donne 404', async () => {
    const goal = (await call('POST', `/api/athletes/${ATHLETE_B}/goals`, 'token-a', GOAL)).json();
    expect((await call('PUT', `/api/athletes/iA/goals/${goal.id}`, 'token-a', { note: 'x' })).statusCode).toBe(404);
    expect((await call('DELETE', `/api/athletes/iA/goals/${goal.id}`, 'token-a')).statusCode).toBe(404);
    expect((await call('GET', `/api/athletes/${C_ATHLETE}/goals`, 'token-a')).statusCode).toBe(404);
  });
});
