import { randomUUID } from 'node:crypto';
import type { CalendarStore, NewCalendarRow } from './db/calendarRepo.js';
import { addDays } from './lib/care.js';
import { parisToday, type CalendarRow, type GoalInput, type GoalRow } from './lib/calendar.js';
import { demoSource } from './sources.js';

/**
 * Calendrier et objectifs du mode démo : données en mémoire (les comptes démo
 * n'existent pas en base). Les règles sont les mêmes que la base ; « Intervals.icu »
 * est DemoSource. Seed pour demo-1 : une compétition A dans 6 semaines et
 * deux objectifs, créés aussi côté DemoSource pour que l'import les retrouve.
 */

const stores = new Map<string, Promise<CalendarStore>>();

/** Magasin de l'athlète démo (créé et amorcé au premier accès). */
export function demoCalendarStore(athleteId: string): Promise<CalendarStore> {
  let store = stores.get(athleteId);
  if (!store) {
    store = createStore(athleteId);
    stores.set(athleteId, store);
  }
  return store;
}

async function createStore(athleteId: string): Promise<CalendarStore> {
  const rows = new Map<string, CalendarRow>();
  const goals = new Map<string, GoalRow>();
  const now = () => new Date().toISOString();
  const byDay = (a: CalendarRow, b: CalendarRow) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id);

  const store: CalendarStore = {
    async list(from, to) {
      return [...rows.values()].filter((r) => r.day >= from && r.day <= to).sort(byDay);
    },
    async find(ref) {
      return [...rows.values()].find((r) => r.id === ref || r.intervalsId === ref) ?? null;
    },
    async insert(r: NewCalendarRow, maxFuture) {
      const today = parisToday();
      const future = [...rows.values()].filter((x) => x.day >= today).length;
      if (r.day >= today && future >= maxFuture) return null;
      const row: CalendarRow = { ...r, id: randomUUID(), updatedAt: now() };
      rows.set(row.id, row);
      return row;
    },
    async update(id, r) {
      const current = rows.get(id);
      if (!current) return null;
      const row: CalendarRow = { ...r, id, updatedAt: now() };
      rows.set(id, row);
      return row;
    },
    async remove(id) {
      return rows.delete(id);
    },
    async races(from) {
      return [...rows.values()].filter((r) => r.kind === 'race' && r.day >= from).sort(byDay);
    },
    async raceExists(id) {
      return rows.get(id)?.kind === 'race';
    },
    async goals() {
      return [...goals.values()].sort((a, b) => (a.dueDay ?? '9999').localeCompare(b.dueDay ?? '9999'));
    },
    async goal(id) {
      return goals.get(id) ?? null;
    },
    async insertGoal(g: GoalInput, createdBy, max) {
      if (goals.size >= max) return null;
      const row: GoalRow = { ...g, id: randomUUID(), createdBy, updatedAt: now() };
      goals.set(row.id, row);
      return row;
    },
    async updateGoal(id, g) {
      if (!goals.has(id)) return null;
      const row: GoalRow = { ...g, id, createdBy: goals.get(id)!.createdBy, updatedAt: now() };
      goals.set(id, row);
      return row;
    },
    async deleteGoal(id) {
      return goals.delete(id);
    },
  };

  if (athleteId === 'demo-1') await seed(store, athleteId);
  return store;
}

/** Compétition A dans 6 semaines (côté Intervals démo et côté app) + deux objectifs. */
async function seed(store: CalendarStore, athleteId: string): Promise<void> {
  const today = parisToday();
  const raceDay = addDays(today, 42);
  const ev = await demoSource().createEvent(athleteId, { category: 'RACE_A', date: raceDay, name: 'Grand Fond de démo', sport: 'Ride' });
  const race = await store.insert(
    {
      kind: 'race',
      sport: 'Ride',
      day: raceDay,
      name: 'Grand Fond de démo',
      description: null,
      racePriority: 'A',
      raceDistanceM: 120_000,
      raceGoal: 'Finir en moins de 5 h',
      origin: 'app',
      intervalsId: String(ev.id),
      syncStatus: 'synced',
      syncError: null,
      createdBy: 'coach',
    },
    Number.MAX_SAFE_INTEGER,
  );
  const base = { targetValue: null, achievedOn: null, note: null };
  for (const g of [
    { ...base, title: 'FTP à 280 W', metric: 'ftp' as const, targetValue: 280, dueDay: addDays(today, 90), raceId: null },
    { ...base, title: 'Finir le Grand Fond', metric: 'other' as const, dueDay: raceDay, raceId: race?.id ?? null },
  ]) {
    await store.insertGoal(g, 'coach', Number.MAX_SAFE_INTEGER);
  }
}
