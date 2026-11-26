import { config } from './config.js';
import { invalidateKeys } from './cache.js';
import { dbCalendarStore, type CalendarStore, type NewCalendarRow } from './db/calendarRepo.js';
import { findUserByAthlete } from './db/repo.js';
import { demoCalendarStore } from './demoCalendar.js';
import { demoSource, sourceFor } from './sources.js';
import { storeOf, withAppLoad } from './activityStore.js';
import { CALENDAR_LIMITS, categoryOf, dayStatus, eventJson, importedFields, parisToday, reconcile, type CalendarRow, type CreatedBy, type EventInput, type EventPatch } from './lib/calendar.js';
import { matchPlan } from './lib/plan.js';
import { removeEventFromDevices, syncEventToDevices } from './devices/service.js';
import { ProviderError } from './providers/http.js';
import type { CalendarEventPatch, IntervalsActivity, IntervalsEvent } from './types.js';
import { BadRequest, Conflict, HttpError, NotFound } from './validation.js';

/**
 * Calendrier stocké dans l'app (source de vérité) et recopié vers Intervals.icu.
 * Règles (docs/plans/C-calendrier.md) :
 *  - écrire : d'abord en base (`pending`), puis Intervals.icu → `synced` + `intervals_id`,
 *    ou `error` + message court. La réponse reste un succès : la donnée est enregistrée ;
 *  - lire : importer les événements créés chez Intervals.icu, retirer les lignes importées
 *    disparues, signaler les lignes de l'app disparues chez Intervals.icu.
 * Le quota (`editCalendar`, `assignWorkout`) est vérifié par la route avant l'appel.
 */

/** Magasin de l'athlète : base (compte réel) ou mémoire (démo). */
export async function calendarStoreFor(athleteId: string): Promise<CalendarStore> {
  if (config.demoMode) return demoCalendarStore(athleteId);
  const user = await findUserByAthlete(athleteId);
  if (!user) throw new NotFound('Athlète introuvable');
  return dbCalendarStore(user.id);
}

/** Nom affiché de l'athlète (vue « Aujourd'hui »). */
async function nameOf(athleteId: string): Promise<string> {
  if (config.demoMode) return (await demoSource().athlete(athleteId)).name ?? athleteId;
  return (await findUserByAthlete(athleteId))?.name ?? athleteId;
}

/** Le calendrier vient de changer : on jette les plages d'événements en cache. */
export async function invalidateEvents(athleteId: string): Promise<void> {
  await invalidateKeys(`icu:events:${athleteId}:*`).catch(() => undefined);
}

/** Message court et sûr pour l'utilisateur : jamais de jeton ni d'URL. */
function shortError(e: unknown, fallback: string): string {
  const msg = e instanceof HttpError || e instanceof ProviderError ? e.message : fallback;
  return msg.slice(0, 300);
}

/** 404 venant d'Intervals.icu (ProviderError) ou de la démo (statusCode). */
function isNotFound(e: unknown): boolean {
  const x = e as { status?: number; statusCode?: number } | null;
  return x?.status === 404 || x?.statusCode === 404;
}

/** Ligne de la base sans ses champs calculés (id, date de mise à jour). */
function toNewRow(r: CalendarRow): NewCalendarRow {
  return {
    kind: r.kind,
    sport: r.sport,
    day: r.day,
    name: r.name,
    description: r.description,
    racePriority: r.racePriority,
    raceDistanceM: r.raceDistanceM,
    raceGoal: r.raceGoal,
    origin: r.origin,
    intervalsId: r.intervalsId,
    syncStatus: r.syncStatus,
    syncError: r.syncError,
    createdBy: r.createdBy,
  };
}

/* ---------- Lecture ---------- */

export interface CalendarRead {
  events: Array<IntervalsEvent & Record<string, unknown>>;
  activities: IntervalsActivity[];
  doneEventIds: string[];
}

/**
 * Calendrier d'un athlète entre deux dates : import / réconciliation, puis
 * lecture de la base. Les événements Intervals.icu d'autres catégories
 * (HOLIDAY, SICK…) sont renvoyés tels quels.
 */
export async function readCalendar(athleteId: string, from: string, to: string): Promise<CalendarRead> {
  const store = await calendarStoreFor(athleteId);
  const src = await sourceFor(athleteId);
  const startedAt = Date.now();
  const [events, activities] = await Promise.all([src.events(athleteId, from, to), src.activities(athleteId, from, to)]);

  const before = await store.list(from, to);
  const rec = reconcile(before, events, startedAt);
  for (const fields of rec.toInsert) await store.insert(fields, Number.MAX_SAFE_INTEGER);
  for (const id of rec.toRemove) await store.remove(id);
  for (const id of rec.toError) {
    const row = before.find((r) => r.id === id);
    if (row) await store.update(id, { ...toNewRow(row), syncStatus: 'error', syncError: 'Supprimée dans Intervals.icu' });
  }

  const rows = rec.toInsert.length || rec.toRemove.length || rec.toError.length ? await store.list(from, to) : before;
  const passthrough = events.filter((e) => importedFields(e) === null);
  const mapped = [...rows.map(eventJson), ...passthrough] as CalendarRead['events'];
  const { activityOf } = matchPlan(mapped, activities);
  const doneEventIds = [...activityOf.keys()].filter((e) => e.id != null).map((e) => String(e.id));
  return { events: mapped, activities, doneEventIds };
}

/* ---------- Écriture ---------- */

/** Ligne nouvelle (origine app) depuis une saisie validée. */
function newRowOf(input: EventInput, createdBy: CreatedBy): NewCalendarRow {
  return {
    kind: input.kind,
    sport: input.sport,
    day: input.date,
    name: input.name,
    description: input.description,
    racePriority: input.racePriority,
    raceDistanceM: input.raceDistanceM,
    raceGoal: input.raceGoal,
    origin: 'app',
    intervalsId: null,
    syncStatus: 'pending',
    syncError: null,
    createdBy,
  };
}

/** Champs envoyés à Intervals.icu pour une ligne complète. */
function fullEvent(row: Pick<CalendarRow, 'kind' | 'racePriority' | 'day' | 'name' | 'description' | 'sport'>) {
  return {
    category: categoryOf(row.kind, row.racePriority),
    date: row.day,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    ...(row.sport ? { sport: row.sport } : {}),
  };
}

/** Envoie une ligne sans id Intervals.icu et enregistre le résultat (synced ou error). */
async function pushCreate(athleteId: string, store: CalendarStore, row: CalendarRow): Promise<CalendarRow> {
  try {
    const ev = await (await sourceFor(athleteId)).createEvent(athleteId, fullEvent(row));
    await invalidateEvents(athleteId);
    return (await store.update(row.id, { ...toNewRow(row), intervalsId: String(ev.id), syncStatus: 'synced', syncError: null })) ?? row;
  } catch (e) {
    await invalidateEvents(athleteId);
    return (await store.update(row.id, { ...toNewRow(row), syncStatus: 'error', syncError: shortError(e, 'Envoi à Intervals.icu impossible') })) ?? row;
  }
}

/** Crée une séance, une compétition ou une note. Renvoie la ligne (synchronisée ou en erreur). */
/** Recopie une séance vers les appareils reliés (Wahoo) : en arrière-plan, erreurs ignorées (jamais bloquant). */
function toDevices(athleteId: string, row: CalendarRow): void {
  void syncEventToDevices(athleteId, row).catch(() => undefined);
}

/** Crée une séance, une compétition ou une note. Renvoie la ligne (synchronisée ou en erreur). */
export async function createEvent(athleteId: string, input: EventInput, by: 'athlete' | 'coach'): Promise<CalendarRow> {
  const row = await createEventRow(athleteId, input, by);
  toDevices(athleteId, row);
  return row;
}

async function createEventRow(athleteId: string, input: EventInput, by: 'athlete' | 'coach'): Promise<CalendarRow> {
  const store = await calendarStoreFor(athleteId);
  const row = await store.insert(newRowOf(input, by), CALENDAR_LIMITS.maxFuture);
  if (!row) throw new Conflict(`${CALENDAR_LIMITS.maxFuture} événements à venir au plus pour cet athlète`);
  return pushCreate(athleteId, store, row);
}

/** Forme finale d'une ligne après modification partielle (validation incluse). */
function mergeRow(row: CalendarRow, patch: EventPatch): NewCalendarRow {
  const merged: NewCalendarRow = {
    ...toNewRow(row),
    day: patch.date ?? row.day,
    name: patch.name ?? row.name,
    description: patch.description !== undefined ? patch.description : row.description,
    sport: patch.sport !== undefined ? patch.sport : row.sport,
    racePriority: patch.racePriority !== undefined ? patch.racePriority : row.racePriority,
    raceDistanceM: patch.raceDistanceM !== undefined ? patch.raceDistanceM : row.raceDistanceM,
    raceGoal: patch.raceGoal !== undefined ? patch.raceGoal : row.raceGoal,
  };
  if (row.kind === 'workout' && !merged.sport) throw new BadRequest('sport requis pour une séance');
  if (row.kind === 'race' && !merged.racePriority) throw new BadRequest('priorité A, B ou C requise pour une compétition');
  if (row.kind === 'note') merged.sport = null;
  return merged;
}

/** Modifie une séance / compétition / note (uuid ou id Intervals.icu). Seuls les champs modifiés partent chez Intervals.icu. */
export async function updateEvent(athleteId: string, ref: string, patch: EventPatch): Promise<CalendarRow> {
  const row = await updateEventRow(athleteId, ref, patch);
  toDevices(athleteId, row);
  return row;
}

async function updateEventRow(athleteId: string, ref: string, patch: EventPatch): Promise<CalendarRow> {
  const store = await calendarStoreFor(athleteId);
  const row = await store.find(ref);
  if (!row) throw new NotFound('Événement introuvable');
  const merged = mergeRow(row, patch);

  if (!row.intervalsId) {
    const saved = (await store.update(row.id, { ...merged, syncStatus: 'pending', syncError: null })) ?? row;
    return pushCreate(athleteId, store, saved);
  }
  const changes: CalendarEventPatch = {};
  if (merged.day !== row.day) changes.date = merged.day;
  if (merged.name !== row.name) changes.name = merged.name;
  if (merged.description !== row.description && merged.description != null) changes.description = merged.description;
  if (merged.sport && merged.sport !== row.sport) changes.sport = merged.sport;
  const category = categoryOf(merged.kind, merged.racePriority);
  if (category !== categoryOf(row.kind, row.racePriority)) changes.category = category;
  if (Object.keys(changes).length === 0) {
    return (await store.update(row.id, { ...merged, syncStatus: row.syncStatus, syncError: row.syncError })) ?? row;
  }

  const saved = (await store.update(row.id, { ...merged, syncStatus: 'pending', syncError: null })) ?? row;
  try {
    await (await sourceFor(athleteId)).updateEvent(athleteId, row.intervalsId, changes);
    await invalidateEvents(athleteId);
    return (await store.update(row.id, { ...merged, syncStatus: 'synced', syncError: null })) ?? saved;
  } catch (e) {
    await invalidateEvents(athleteId);
    const syncError = isNotFound(e) ? 'Supprimée dans Intervals.icu' : shortError(e, 'Envoi à Intervals.icu impossible');
    return (await store.update(row.id, { ...merged, syncStatus: 'error', syncError })) ?? saved;
  }
}

/**
 * Supprime une ligne, et l'événement chez Intervals.icu s'il existe (un 404 là-bas
 * ne bloque pas). Si Intervals.icu refuse, la ligne reste en erreur.
 */
export async function removeEvent(athleteId: string, ref: string): Promise<{ removed: boolean; syncError?: string }> {
  const store = await calendarStoreFor(athleteId);
  const row = await store.find(ref);
  if (!row) throw new NotFound('Événement introuvable');
  if (row.intervalsId) {
    try {
      await (await sourceFor(athleteId)).deleteEvent(athleteId, row.intervalsId);
    } catch (e) {
      if (!isNotFound(e)) {
        const syncError = shortError(e, 'Suppression chez Intervals.icu impossible');
        await store.update(row.id, { ...toNewRow(row), syncStatus: 'error', syncError });
        await invalidateEvents(athleteId);
        return { removed: false, syncError };
      }
    }
  }
  // Avant la suppression : la ligne de suivi de l'appareil disparaît avec l'événement (cascade).
  await removeEventFromDevices(athleteId, row.id).catch(() => undefined);
  await store.remove(row.id);
  await invalidateEvents(athleteId);
  return { removed: true };
}

/** Renvoie vers Intervals.icu une ligne en erreur (ou jamais envoyée) : crée ou met à jour l'événement. */
export async function resyncEvent(athleteId: string, ref: string): Promise<CalendarRow> {
  const row = await resyncEventRow(athleteId, ref);
  toDevices(athleteId, row);
  return row;
}

async function resyncEventRow(athleteId: string, ref: string): Promise<CalendarRow> {
  const store = await calendarStoreFor(athleteId);
  const row = await store.find(ref);
  if (!row) throw new NotFound('Événement introuvable');
  if (!row.intervalsId) return pushCreate(athleteId, store, row);
  try {
    await (await sourceFor(athleteId)).updateEvent(athleteId, row.intervalsId, fullEvent(row));
    await invalidateEvents(athleteId);
    return (await store.update(row.id, { ...toNewRow(row), syncStatus: 'synced', syncError: null })) ?? row;
  } catch (e) {
    await invalidateEvents(athleteId);
    // Supprimée chez Intervals.icu : on la recrée, avec un nouvel id.
    if (isNotFound(e)) return pushCreate(athleteId, store, { ...row, intervalsId: null });
    return (await store.update(row.id, { ...toNewRow(row), syncStatus: 'error', syncError: shortError(e, 'Envoi à Intervals.icu impossible') })) ?? row;
  }
}

/* ---------- Vue du coach : « Aujourd'hui » ---------- */

export interface TeamDayAthlete {
  id: string;
  name: string;
  status: 'done' | 'planned' | 'missed' | 'rest' | 'extra' | null;
  planned: Array<IntervalsEvent & Record<string, unknown>>;
  done: Array<{ id: string; name: string | null; type: string | null; moving_time: number | null; icu_training_load: number | null }>;
  error?: string;
}

/** Journée de l'équipe : séances prévues, sorties faites et statut, par athlète. Une source en échec ne bloque pas les autres. */
export async function teamDay(athleteIds: string[], date: string): Promise<TeamDayAthlete[]> {
  const past = date < parisToday();
  const onDay = (d: string | undefined) => (d ?? '').slice(0, 10) === date;
  return Promise.all(
    athleteIds.map(async (id): Promise<TeamDayAthlete> => {
      const name = await nameOf(id).catch(() => id);
      try {
        const { events, activities, doneEventIds } = await readCalendar(id, date, date);
        const planned = events.filter((e) => onDay(e.start_date_local));
        const workouts = planned.filter((e) => e.category === 'WORKOUT');
        const plannedDone = workouts.filter((e) => doneEventIds.includes(String(e.id))).length;
        // Cherche la charge calculée par l'app (comme dans le feed) pour cohérence.
        const src = await sourceFor(id);
        const store = await storeOf(id, src, new Date());
        const today = await withAppLoad(store, activities.filter((a) => onDay(a.start_date_local)), date, date);
        const done = today.map((a) => ({
          id: String(a.id),
          name: a.name ?? null,
          type: a.type ?? null,
          moving_time: a.moving_time ?? null,
          icu_training_load: a.icu_training_load ?? null,
        }));
        const status = dayStatus({ planned: workouts.length, plannedDone, activities: done.length, past });
        return { id, name, status, planned, done };
      } catch (e) {
        return { id, name, status: null, planned: [], done: [], error: shortError(e, 'Intervals.icu indisponible') };
      }
    }),
  );
}
