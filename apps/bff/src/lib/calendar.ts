import type { CalendarCategory, IntervalsEvent } from '../types.js';
import { SPORTS, type Sport } from './sport.js';
import { BadRequest, DATE_RE, validateString, validateUuid } from '../validation.js';

/**
 * Calendrier de l'athlète (phase C) : validation des entrées, correspondance
 * entre lignes de la base et événements Intervals.icu, statut de la journée.
 * Fonctions pures : aucun accès réseau ni base ici.
 */

export const CALENDAR_LIMITS = { maxFuture: 500, maxGoals: 30, maxRange: 62 } as const;

/** `rest` : jour de repos prescrit par le coach (recopié comme NOTE chez Intervals.icu). */
export type EventKind = 'workout' | 'race' | 'note' | 'rest';
export type RacePriority = 'A' | 'B' | 'C';
export type SyncStatus = 'pending' | 'synced' | 'error';
export type EventOrigin = 'app' | 'intervals';
export type CreatedBy = 'athlete' | 'coach' | 'intervals';

/** Ligne du calendrier (forme commune à la base et à la démo). */
export interface CalendarRow {
  id: string;
  kind: EventKind;
  sport: Sport | null;
  day: string;
  name: string;
  description: string | null;
  racePriority: RacePriority | null;
  raceDistanceM: number | null;
  raceGoal: string | null;
  origin: EventOrigin;
  intervalsId: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  createdBy: CreatedBy;
  /** ISO 8601 : sert à ignorer une ligne modifiée pendant une lecture Intervals.icu. */
  updatedAt: string;
}

/** Données saisies pour créer ou modifier une séance / compétition / note. */
export interface EventInput {
  kind: EventKind;
  date: string;
  name: string;
  description: string | null;
  sport: Sport | null;
  racePriority: RacePriority | null;
  raceDistanceM: number | null;
  raceGoal: string | null;
}

export type EventPatch = Partial<Omit<EventInput, 'kind'>>;

const KINDS: readonly EventKind[] = ['workout', 'race', 'note', 'rest'];
/** Nom d'un repos prescrit quand le coach n'en donne pas. */
export const REST_NAME = 'Repos';
const PRIORITIES: readonly RacePriority[] = ['A', 'B', 'C'];

function fail(message: string): never {
  throw new BadRequest(message);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function optionalString(v: unknown, name: string, max: number): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') fail(`${name} invalide`);
  return validateString(v, name, max);
}

function optionalSport(v: unknown): Sport | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && (SPORTS as readonly string[]).includes(v)) return v as Sport;
  fail('sport invalide (Ride, Run ou Swim)');
}

function optionalPriority(v: unknown): RacePriority | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && (PRIORITIES as readonly RacePriority[]).includes(v as RacePriority)) return v as RacePriority;
  fail('priorité invalide (A, B ou C)');
}

function optionalDistance(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 100 || v > 1_000_000) fail('distance invalide (100 m à 1 000 km)');
  return v;
}

function day(v: unknown, name = 'date'): string {
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) fail(`${name} invalide (AAAA-MM-JJ)`);
  return v;
}

/** Validation complète d'une création. */
export function validateEventInput(body: unknown): EventInput {
  const b = isObj(body) ? body : {};
  if (!KINDS.includes(b.kind as EventKind)) fail('kind invalide (workout, race, note ou rest)');
  const kind = b.kind as EventKind;
  const sport = optionalSport(b.sport);
  const racePriority = optionalPriority(b.racePriority);
  if (kind === 'workout' && !sport) fail('sport requis pour une séance');
  if (kind === 'race' && !racePriority) fail('priorité A, B ou C requise pour une compétition');
  // Un repos se suffit à lui-même : sans nom, il s'appelle « Repos ».
  const name = kind === 'rest' && (b.name == null || (typeof b.name === 'string' && b.name.trim() === '')) ? REST_NAME : b.name;
  if (typeof name !== 'string') fail('name requis');
  return {
    kind,
    date: day(b.date),
    name: validateString(name, 'name', 120),
    description: optionalString(b.description, 'description', 4000),
    sport: kind === 'note' || kind === 'rest' ? null : sport,
    racePriority: kind === 'race' ? racePriority : null,
    raceDistanceM: kind === 'race' ? optionalDistance(b.raceDistanceM) : null,
    raceGoal: kind === 'race' ? optionalString(b.raceGoal, 'raceGoal', 200) : null,
  };
}

/**
 * Validation d'une modification partielle : seuls les champs présents sont
 * retournés. Le type (kind) ne change pas.
 */
export function validateEventPatch(body: unknown): EventPatch {
  const b = isObj(body) ? body : {};
  const patch: EventPatch = {};
  if (b.date !== undefined) patch.date = day(b.date);
  if (b.name !== undefined) {
    if (typeof b.name !== 'string') fail('name invalide');
    patch.name = validateString(b.name, 'name', 120);
  }
  if (b.description !== undefined) patch.description = optionalString(b.description, 'description', 4000);
  if (b.sport !== undefined) patch.sport = optionalSport(b.sport);
  if (b.racePriority !== undefined) patch.racePriority = optionalPriority(b.racePriority);
  if (b.raceDistanceM !== undefined) patch.raceDistanceM = optionalDistance(b.raceDistanceM);
  if (b.raceGoal !== undefined) patch.raceGoal = optionalString(b.raceGoal, 'raceGoal', 200);
  return patch;
}

/**
 * Catégorie Intervals.icu d'une ligne (compétition = RACE_ + priorité). Un repos
 * prescrit part en NOTE : Intervals.icu n'a pas de catégorie « repos », et une
 * séance (WORKOUT) fausserait sa charge prévue et la montre.
 */
export function categoryOf(kind: EventKind, racePriority: RacePriority | null): CalendarCategory {
  if (kind === 'race') return `RACE_${racePriority ?? 'C'}` as CalendarCategory;
  return kind === 'note' || kind === 'rest' ? 'NOTE' : 'WORKOUT';
}

const IMPORTABLE: ReadonlySet<string> = new Set(['WORKOUT', 'RACE_A', 'RACE_B', 'RACE_C', 'NOTE']);

/** Une ligne de base → la forme d'événement renvoyée au web (gardée compatible avec Intervals.icu). */
export function eventJson(r: CalendarRow): IntervalsEvent & Record<string, unknown> {
  return {
    id: r.intervalsId ?? r.id,
    appId: r.id,
    category: categoryOf(r.kind, r.racePriority),
    type: r.sport ?? undefined,
    start_date_local: `${r.day}T00:00:00`,
    name: r.name,
    description: r.description ?? undefined,
    kind: r.kind,
    racePriority: r.racePriority,
    raceDistanceM: r.raceDistanceM,
    raceGoal: r.raceGoal,
    origin: r.origin,
    syncStatus: r.syncStatus,
    syncError: r.syncError,
  };
}

/** Champs d'une ligne importée depuis un événement Intervals.icu, ou null si la catégorie n'est pas gérée par l'app. */
export function importedFields(e: IntervalsEvent): Omit<CalendarRow, 'id' | 'updatedAt'> | null {
  const category = e.category ?? '';
  if (!IMPORTABLE.has(category) || e.id == null) return null;
  const kind: EventKind = category === 'NOTE' ? 'note' : category.startsWith('RACE_') ? 'race' : 'workout';
  const sport = (SPORTS as readonly string[]).includes(e.type ?? '') ? (e.type as Sport) : null;
  const name = (e.name ?? '').trim().slice(0, 120) || (kind === 'race' ? 'Compétition' : kind === 'note' ? 'Note' : 'Séance');
  return {
    kind,
    sport: kind === 'note' ? null : sport,
    day: e.start_date_local.slice(0, 10),
    name,
    description: e.description ? e.description.slice(0, 4000) : null,
    racePriority: kind === 'race' ? (category.slice(-1) as RacePriority) : null,
    raceDistanceM: null,
    raceGoal: null,
    origin: 'intervals',
    intervalsId: String(e.id),
    syncStatus: 'synced',
    syncError: null,
    createdBy: 'intervals',
  };
}

export interface Reconciliation {
  /** Événements Intervals.icu à importer dans la base. */
  toInsert: Array<Omit<CalendarRow, 'id' | 'updatedAt'>>;
  /** Lignes importées qui ont disparu chez Intervals.icu : à supprimer. */
  toRemove: string[];
  /** Lignes créées dans l'app, recopiées, mais disparues chez Intervals.icu : à marquer en erreur. */
  toError: string[];
}

/**
 * Compare la base et la plage lue chez Intervals.icu.
 * - nouveaux événements (catégories gérées, sans ligne correspondante) → import ;
 * - lignes importées absentes → supprimées ;
 * - lignes de l'app « synchronisées » absentes → erreur « Supprimée dans Intervals.icu ».
 * `readStartedAt` (ms) : une ligne modifiée après le début de la lecture est
 * ignorée (sa modification peut ne pas figurer dans la lecture).
 */
export function reconcile(rows: CalendarRow[], events: IntervalsEvent[], readStartedAt: number): Reconciliation {
  const known = new Set(rows.map((r) => r.intervalsId).filter((x): x is string => x != null));
  const present = new Set(events.filter((e) => e.id != null).map((e) => String(e.id)));
  const toInsert: Reconciliation['toInsert'] = [];
  for (const e of events) {
    if (e.id == null || known.has(String(e.id))) continue;
    const fields = importedFields(e);
    if (fields) {
      toInsert.push(fields);
      known.add(String(e.id));
    }
  }
  const toRemove: string[] = [];
  const toError: string[] = [];
  for (const r of rows) {
    if (r.intervalsId == null || present.has(r.intervalsId)) continue;
    if (Date.parse(r.updatedAt) >= readStartedAt) continue;
    if (r.origin === 'intervals') toRemove.push(r.id);
    else if (r.syncStatus === 'synced') toError.push(r.id);
  }
  return { toInsert, toRemove, toError };
}

/**
 * Statut d'une journée pour la vue « Aujourd'hui » du coach.
 * - done : toutes les séances prévues sont faites (ou sortie faite sans séance prévue) ;
 * - missed : jour passé, séance prévue non faite ;
 * - planned : séance prévue pas encore faite ;
 * - extra : sortie faite sans séance prévue ;
 * - rest : rien de prévu ni de fait.
 */
export function dayStatus(input: { planned: number; plannedDone: number; activities: number; past: boolean }): 'done' | 'planned' | 'missed' | 'rest' | 'extra' {
  if (input.planned > 0) {
    if (input.plannedDone >= input.planned) return 'done';
    return input.past ? 'missed' : 'planned';
  }
  return input.activities > 0 ? 'extra' : 'rest';
}

/** Date du jour à Paris (AAAA-MM-JJ). */
export function parisToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/* ---------- Objectifs ---------- */

export const GOAL_METRICS = ['ftp', 'weight', 'run_threshold', 'swim_threshold', 'vma', 'weekly_hours', 'other'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export interface GoalRow {
  id: string;
  title: string;
  metric: GoalMetric | null;
  targetValue: number | null;
  dueDay: string | null;
  raceId: string | null;
  achievedOn: string | null;
  note: string | null;
  createdBy: 'athlete' | 'coach';
  updatedAt: string;
}

export type GoalInput = Omit<GoalRow, 'id' | 'createdBy' | 'updatedAt'>;

const optionalDay = (v: unknown, name: string): string | null => (v == null || v === '' ? null : day(v, name));

/** Validation d'un objectif (création : tous les champs ; `partial` = modification). */
export function validateGoalInput(body: unknown, partial = false): Partial<GoalInput> {
  const b = isObj(body) ? body : {};
  const out: Partial<GoalInput> = {};
  if (b.title !== undefined || !partial) {
    if (typeof b.title !== 'string') fail('title requis');
    out.title = validateString(b.title, 'title', 120);
  }
  if (b.metric !== undefined || !partial) {
    if (b.metric == null || b.metric === '') out.metric = null;
    else if (typeof b.metric === 'string' && (GOAL_METRICS as readonly string[]).includes(b.metric)) out.metric = b.metric as GoalMetric;
    else fail('métrique invalide');
  }
  if (b.targetValue !== undefined || !partial) {
    if (b.targetValue == null || b.targetValue === '') out.targetValue = null;
    else {
      const n = Number(b.targetValue);
      if (!Number.isFinite(n) || n < 0 || n > 99_999) fail('valeur cible invalide');
      out.targetValue = Math.round(n * 10) / 10;
    }
  }
  if (b.dueDay !== undefined || !partial) out.dueDay = optionalDay(b.dueDay, 'dueDay');
  if (b.achievedOn !== undefined || !partial) out.achievedOn = optionalDay(b.achievedOn, 'achievedOn');
  if (b.raceId !== undefined || !partial) out.raceId = b.raceId == null || b.raceId === '' ? null : validateUuid(b.raceId, 'raceId');
  if (b.note !== undefined || !partial) out.note = optionalString(b.note, 'note', 500);
  return out;
}

export function goalJson(g: GoalRow) {
  return {
    id: g.id,
    title: g.title,
    metric: g.metric,
    targetValue: g.targetValue,
    dueDay: g.dueDay,
    raceId: g.raceId,
    achievedOn: g.achievedOn,
    note: g.note,
    createdBy: g.createdBy,
    updatedAt: g.updatedAt,
  };
}
