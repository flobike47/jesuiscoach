import { gunzipSync, gzipSync } from 'node:zlib';
import { config } from './config.js';
import * as repo from './db/activityRepo.js';
import type { ActivityRecord, BestRecord, ComputedRecord, StreamsStatus, SummaryRecord } from './db/activityRepo.js';
import { dbProfileStore } from './db/profileRepo.js';
import { demoProfileStore } from './demoProfile.js';
import { fitnessSeries, type FitnessDay } from './lib/fitness.js';
import { computeMetrics, seriesFromStreams, type ActivityMetrics, type RawSeries, type Thresholds } from './lib/metrics.js';
import type { PhysioValues, StoredProfile } from './lib/profile.js';
import { sportOf, type Sport } from './lib/sport.js';
import { ftpOf, isoDay } from './lib/summary.js';
import type { AthleteSource } from './sources.js';
import type { IntervalsActivity, IntervalsAthlete, IntervalsStream, IntervalsWellness } from './types.js';

/**
 * Sorties de l'app : copie des résumés et des courbes, et calculs faits ici
 * (lib/metrics.ts, lib/fitness.ts) avec les seuils de la fiche profil.
 *
 * Deux magasins de même interface : Postgres pour les vrais comptes, mémoire
 * pour les athlètes démo (qui n'existent pas en base). Aucun appel à Intervals.icu
 * ici, sauf `rawStreams` et `athlete` passés en paramètre par l'appelant.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Fenêtre lue à la demande en mode démo (même durée que la fitness affichée). */
const DEMO_WINDOW_DAYS = 90;

export interface ActivityBackend {
  upsert(rows: SummaryRecord[]): Promise<void>;
  list(from: string, to: string): Promise<ActivityRecord[]>;
  get(id: string): Promise<ActivityRecord | null>;
  stored(limit: number): Promise<ActivityRecord[]>;
  missing(limit: number): Promise<string[]>;
  countFrom(from: string): Promise<number>;
  setStatus(id: string, status: StreamsStatus): Promise<void>;
  saveStreams(id: string, series: RawSeries): Promise<void>;
  loadStreams(id: string): Promise<RawSeries | null>;
  saveComputed(id: string, c: ComputedRecord, status: StreamsStatus): Promise<void>;
  bests(from: string, to: string): Promise<BestRecord[]>;
}

/** Magasin d'un athlète et accès à sa fiche (seuils). */
export interface StoreContext {
  backend: ActivityBackend;
  profile: () => Promise<StoredProfile | null>;
}

/* ---------- Magasin Postgres ---------- */

function dbBackend(userId: string): ActivityBackend {
  return {
    upsert: (rows) => repo.upsertSummaries(userId, rows),
    list: (from, to) => repo.listActivities(userId, from, to),
    get: (id) => repo.getActivity(userId, id),
    stored: (limit) => repo.storedActivities(userId, limit),
    missing: (limit) => repo.missingActivityIds(userId, limit),
    countFrom: (from) => repo.countActivitiesFrom(userId, from),
    setStatus: (id, status) => repo.setStreamsStatus(userId, id, status),
    saveStreams: async (id, series) => {
      await repo.saveStreams(userId, id, gzipSync(Buffer.from(JSON.stringify(series))), series.time.length);
    },
    loadStreams: async (id) => {
      const buf = await repo.loadStreams(userId, id);
      return buf ? (JSON.parse(gunzipSync(buf).toString('utf8')) as RawSeries) : null;
    },
    saveComputed: (id, c, status) => repo.saveComputed(userId, id, c, status),
    bests: (from, to) => repo.bestsInWindow(userId, from, to),
  };
}

/* ---------- Magasin mémoire (démo) ---------- */

interface MemoryAthlete {
  rows: Map<string, ActivityRecord>;
  series: Map<string, RawSeries>;
  bests: Map<string, Array<{ secs: number; watts: number }>>;
}

const memory = new Map<string, MemoryAthlete>();

function memoryBackend(athleteId: string): ActivityBackend {
  let m = memory.get(athleteId);
  if (!m) {
    m = { rows: new Map(), series: new Map(), bests: new Map() };
    memory.set(athleteId, m);
  }
  const mem = m;
  const sorted = (rows: ActivityRecord[]) => rows.sort((a, b) => b.startLocal.localeCompare(a.startLocal));
  const inWindow = (r: ActivityRecord, from: string, to: string) => r.startLocal >= `${from}T00:00:00` && r.startLocal < `${addDays(to, 1)}T00:00:00`;
  return {
    async upsert(rows) {
      for (const s of rows) {
        const prev = mem.rows.get(s.id);
        const base = recordOf(s);
        // Comme en base : une mise à jour du résumé ne touche ni les calculs ni l'état des courbes.
        mem.rows.set(s.id, prev ? { ...base, ...computedOf(prev) } : base);
      }
    },
    async list(from, to) {
      return sorted([...mem.rows.values()].filter((r) => inWindow(r, from, to)));
    },
    async get(id) {
      return mem.rows.get(id) ?? null;
    },
    async stored(limit) {
      return sorted([...mem.rows.values()].filter((r) => r.streamsStatus === 'stored')).slice(0, limit);
    },
    async missing(limit) {
      return sorted([...mem.rows.values()].filter((r) => r.streamsStatus === 'missing')).slice(0, limit).map((r) => r.id);
    },
    async countFrom(from) {
      return [...mem.rows.values()].filter((r) => r.startLocal >= `${from}T00:00:00`).length;
    },
    async setStatus(id, status) {
      const r = mem.rows.get(id);
      if (r) mem.rows.set(id, { ...r, streamsStatus: status });
    },
    async saveStreams(id, series) {
      mem.series.set(id, series);
    },
    async loadStreams(id) {
      return mem.series.get(id) ?? null;
    },
    async saveComputed(id, c, status) {
      const r = mem.rows.get(id);
      if (!r) return;
      mem.rows.set(id, { ...r, weightedWatts: c.weightedWatts, intensity: c.intensity, load: c.load, loadMethod: c.loadMethod, ftpUsed: c.ftpUsed, lthrUsed: c.lthrUsed, powerZoneSecs: c.powerZoneSecs, hrZoneSecs: c.hrZoneSecs, streamsStatus: status });
      mem.bests.set(id, c.bests);
    },
    async bests(from, to) {
      const out: BestRecord[] = [];
      for (const [id, list] of mem.bests) {
        const r = mem.rows.get(id);
        if (!r || !inWindow(r, from, to)) continue;
        for (const b of list) out.push({ activityId: id, name: r.name, startLocal: r.startLocal, secs: b.secs, watts: b.watts });
      }
      return out;
    },
  };
}

/** Champs de calcul et d'état d'une ligne (conservés lors d'une mise à jour du résumé). */
function computedOf(r: ActivityRecord) {
  return {
    weightedWatts: r.weightedWatts,
    intensity: r.intensity,
    load: r.load,
    loadMethod: r.loadMethod,
    ftpUsed: r.ftpUsed,
    lthrUsed: r.lthrUsed,
    powerZoneSecs: r.powerZoneSecs,
    hrZoneSecs: r.hrZoneSecs,
    streamsStatus: r.streamsStatus,
  };
}

function recordOf(s: SummaryRecord): ActivityRecord {
  return {
    id: s.id,
    startLocal: s.startLocal,
    sport: s.sport,
    typeRaw: s.typeRaw,
    name: s.name,
    movingSecs: s.movingSecs,
    distanceM: s.distanceM,
    elevationM: s.elevationM,
    avgHr: s.avgHr,
    avgWatts: s.avgWatts,
    avgCadence: s.avgCadence,
    icuLoad: s.icuLoad,
    icuWeightedWatts: s.icuWeightedWatts,
    icuIntensity: s.icuIntensity,
    icuRaw: s.icuRaw,
    weightedWatts: null,
    intensity: null,
    load: null,
    loadMethod: null,
    ftpUsed: null,
    lthrUsed: null,
    powerZoneSecs: null,
    hrZoneSecs: null,
    streamsStatus: 'missing',
  };
}

/* ---------- Contextes ---------- */

export function dbContext(userId: string): StoreContext {
  return { backend: dbBackend(userId), profile: () => dbProfileStore(userId).load() };
}

function memoryContext(athleteId: string): StoreContext {
  return { backend: memoryBackend(athleteId), profile: () => demoProfileStore(athleteId).load() };
}

/**
 * Magasin de l'athlète `athleteId` (identifiant Intervals.icu), ou null si son
 * compte n'est pas connecté. En démo, les sorties récentes sont copiées en mémoire
 * à la demande depuis la source démo.
 */
/**
 * Remplace `icu_training_load` par la charge calculée par l'app quand la
 * sortie est en magasin : une sortie a la même charge sur tous les écrans.
 */
export async function withAppLoad<T extends { id: string | number; icu_training_load?: number | null }>(
  store: StoreContext | null,
  activities: T[],
  from: string,
  to: string,
): Promise<T[]> {
  if (!store || activities.length === 0) return activities;
  const stored = new Map((await store.backend.list(from, to)).map((r) => [r.id, r.load]));
  return activities.map((a) => {
    const load = stored.get(String(a.id));
    return load == null ? a : { ...a, icu_training_load: load };
  });
}

export async function storeOf(athleteId: string, src: AthleteSource, now = new Date()): Promise<StoreContext | null> {
  if (config.demoMode) {
    const ctx = memoryContext(athleteId);
    await refreshDemo(ctx, athleteId, src, now);
    return ctx;
  }
  const userId = await repo.userIdOfAthlete(athleteId);
  return userId ? dbContext(userId) : null;
}

async function refreshDemo(ctx: StoreContext, athleteId: string, src: AthleteSource, now: Date): Promise<void> {
  const acts = await src.activities(athleteId, isoDay(new Date(now.getTime() - DEMO_WINDOW_DAYS * DAY)), isoDay(now));
  await ctx.backend.upsert(acts.flatMap(summaryOf));
  const pending = await ctx.backend.missing(500);
  if (pending.length === 0) return;
  const th = await thresholdsOf(ctx, () => src.athlete(athleteId));
  for (const id of pending) await ingestOne(ctx.backend, id, th, () => src.rawStreams(athleteId, id));
}

/* ---------- Seuils ---------- */

/** Seuils par sport : fiche profil de l'app ; à défaut (fiche jamais ouverte), ceux d'Intervals.icu. */
export async function thresholdsOf(ctx: StoreContext, info: () => Promise<IntervalsAthlete>): Promise<Record<Sport, Thresholds>> {
  const profile = await ctx.profile();
  if (profile) return fromProfile(profile);
  return fromIntervals(await info());
}

export function fromProfile(p: StoredProfile): Record<Sport, Thresholds> {
  const ride: PhysioValues = p.physiology.Ride;
  const run: PhysioValues = p.physiology.Run;
  const swim: PhysioValues = p.physiology.Swim;
  const restingHr = p.identity.restingHr ?? null;
  return {
    Ride: { ftp: ride.ftp, lthr: ride.lthr, maxHr: ride.maxHr, restingHr, thresholdSpeed: null },
    // La puissance (FTP) vient du vélo pour tous les sports.
    Run: { ftp: ride.ftp, lthr: run.lthr, maxHr: run.maxHr, restingHr, thresholdSpeed: run.thresholdSecs ? 1000 / run.thresholdSecs : null },
    Swim: { ftp: ride.ftp, lthr: swim.lthr, maxHr: swim.maxHr, restingHr, thresholdSpeed: swim.thresholdSecs ? 100 / swim.thresholdSecs : null },
  };
}

export function fromIntervals(info: IntervalsAthlete): Record<Sport, Thresholds> {
  const find = (sport: string) => info.sportSettings?.find((s) => s.types?.includes(sport));
  const ride = find('Ride');
  const run = find('Run');
  const swim = find('Swim');
  const ftp = ftpOf(info);
  const restingHr = info.icu_resting_hr ?? null;
  return {
    Ride: { ftp, lthr: ride?.lthr ?? null, maxHr: ride?.max_hr ?? null, restingHr, thresholdSpeed: null },
    Run: { ftp, lthr: run?.lthr ?? null, maxHr: run?.max_hr ?? null, restingHr, thresholdSpeed: run?.threshold_pace ?? null },
    Swim: { ftp, lthr: swim?.lthr ?? null, maxHr: swim?.max_hr ?? null, restingHr, thresholdSpeed: swim?.threshold_pace ?? null },
  };
}

/* ---------- Résumés ---------- */

const bounded = (v: number | null | undefined, max: number, digits = 0): number | null => {
  if (v == null || !Number.isFinite(v) || v < 0 || v > max) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Résumé stockable d'une sortie Intervals.icu ; vide si la date de départ est inexploitable. */
export function summaryOf(a: IntervalsActivity): SummaryRecord[] {
  const startLocal = a.start_date_local ?? '';
  if (startLocal.length < 10 || startLocal.length > 25) return [];
  const startUtc = a.start_date && !Number.isNaN(Date.parse(a.start_date)) ? new Date(a.start_date).toISOString() : null;
  return [
    {
      id: String(a.id),
      startUtc,
      startLocal,
      sport: sportOf(a.type) ?? null,
      typeRaw: a.type ?? null,
      name: a.name ? a.name.slice(0, 200) : null,
      movingSecs: bounded(a.moving_time, 2_000_000),
      distanceM: bounded(a.distance, 9_999_999.9, 1),
      elevationM: bounded(a.total_elevation_gain, 999_999.9, 1),
      avgHr: bounded(a.average_heartrate, 32_767),
      avgWatts: bounded(a.icu_average_watts, 32_767),
      avgCadence: bounded(a.average_cadence, 32_767),
      icuLoad: bounded(a.icu_training_load, 99_999.9, 1),
      icuWeightedWatts: bounded(a.icu_weighted_avg_watts, 32_767),
      icuIntensity: a.icu_intensity == null ? null : bounded(a.icu_intensity / 100, 9.999, 3),
      icuRaw: a,
    },
  ];
}

/* ---------- Calculs et ingestion ---------- */

const sportOfRow = (r: ActivityRecord): Sport => sportOf(r.typeRaw) ?? 'Ride';

function toComputed(m: ActivityMetrics, sport: Sport, th: Record<Sport, Thresholds>): ComputedRecord {
  return {
    weightedWatts: m.weightedWatts,
    intensity: m.intensity,
    load: m.load,
    loadMethod: m.loadMethod,
    ftpUsed: th.Ride.ftp,
    lthrUsed: th[sport].lthr,
    powerZoneSecs: m.powerZoneSecs,
    hrZoneSecs: m.hrZoneSecs,
    bests: m.bests,
  };
}

/** Vrai s'il y a au moins une mesure exploitable (puissance, FC ou vitesse). */
function usable(series: RawSeries): boolean {
  return series.time.length > 0 && [series.watts, series.heartrate, series.velocity].some((ch) => ch?.some((v) => v != null));
}

/**
 * Récupère les courbes d'une sortie, les stocke et calcule. Une erreur ne
 * remonte pas : la sortie passe à `error` (rattrapage plus tard) et `onError` la signale.
 */
export async function ingestOne(
  backend: ActivityBackend,
  id: string,
  th: Record<Sport, Thresholds>,
  rawStreams: () => Promise<IntervalsStream[]>,
  onError: (err: unknown) => void = () => undefined,
): Promise<StreamsStatus> {
  const row = await backend.get(id);
  if (!row) return 'missing';
  try {
    const series = seriesFromStreams(await rawStreams());
    if (!usable(series)) {
      await backend.setStatus(id, 'none');
      return 'none';
    }
    await backend.saveStreams(id, series);
    const sport = sportOfRow(row);
    await backend.saveComputed(id, toComputed(computeMetrics(series, th[sport], sport), sport, th), 'stored');
    return 'stored';
  } catch (err) {
    onError(err);
    await backend.setStatus(id, 'error').catch(() => undefined);
    return 'error';
  }
}

/** Synchro : enregistre les résumés, puis calcule les sorties nouvelles (`fresh`). */
export async function storeSyncedActivities(
  ctx: StoreContext,
  athleteId: string,
  source: AthleteSource,
  activities: IntervalsActivity[],
  fresh: ReadonlySet<string>,
  onError: (err: unknown) => void,
): Promise<void> {
  await ctx.backend.upsert(activities.flatMap(summaryOf));
  const todo = activities.map((a) => String(a.id)).filter((id) => fresh.has(id));
  if (todo.length === 0) return;
  const th = await thresholdsOf(ctx, () => source.athlete(athleteId));
  for (const id of todo) await ingestOne(ctx.backend, id, th, () => source.rawStreams(athleteId, id), onError);
}

/**
 * Recalcule les sorties dont les seuils (FTP, FC seuil) ont changé depuis le
 * calcul, à partir des courbes stockées : aucun appel à Intervals.icu.
 */
export async function recomputeStored(ctx: StoreContext, th: Record<Sport, Thresholds>, limit = 200): Promise<number> {
  const stale = (await ctx.backend.stored(2000))
    .filter((r) => (r.ftpUsed ?? null) !== (th.Ride.ftp ?? null) || (r.lthrUsed ?? null) !== (th[sportOfRow(r)].lthr ?? null))
    .slice(0, limit);
  let done = 0;
  for (const r of stale) {
    const series = await ctx.backend.loadStreams(r.id);
    if (!series) continue;
    const sport = sportOfRow(r);
    await ctx.backend.saveComputed(r.id, toComputed(computeMetrics(series, th[sport], sport), sport, th), 'stored');
    done++;
  }
  return done;
}

/* ---------- Lectures ---------- */

/** Charge retenue pour une sortie : celle de l'app, sinon celle d'Intervals.icu, sinon 0. */
export const loadOf = (r: ActivityRecord): number => r.load ?? r.icuLoad ?? 0;

/**
 * Fitness, fatigue et forme calculées par l'app sur [from, to], au format des
 * wellness Intervals.icu (pour réutiliser `summarize`). Null si aucune sortie
 * n'est en base sur la période : l'appelant garde alors Intervals.icu.
 */
export async function appFitness(
  ctx: StoreContext,
  from: string,
  to: string,
  icuWellness: IntervalsWellness[],
): Promise<{ wellness: IntervalsWellness[]; days: FitnessDay[] } | null> {
  const rows = await ctx.backend.list(from, to);
  if (rows.length === 0) return null;
  const loads = new Map<string, number>();
  for (const r of rows) {
    const day = r.startLocal.slice(0, 10);
    loads.set(day, (loads.get(day) ?? 0) + loadOf(r));
  }
  const seed = icuWellness.find((w) => w.id === from);
  const days = fitnessSeries(loads, from, to, { ctl: seed?.ctl ?? 0, atl: seed?.atl ?? 0 });
  return {
    wellness: days.map((d) => ({ id: d.date, ctl: d.fitness, atl: d.fatigue, rampRate: d.ramp })),
    days,
  };
}

/** Courbes stockées ramenées au format des streams Intervals.icu (pour `downsampleStreams`). */
export function streamsOf(series: RawSeries): IntervalsStream[] {
  const out: IntervalsStream[] = [{ type: 'time', data: series.time }];
  const add = (type: string, data: Array<number | null> | null) => {
    if (data) out.push({ type, data });
  };
  add('watts', series.watts);
  add('heartrate', series.heartrate);
  add('cadence', series.cadence);
  add('velocity_smooth', series.velocity);
  add('distance', series.distance);
  add('altitude', series.altitude);
  return out;
}

/** Date AAAA-MM-JJ décalée de `n` jours. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}
