import type { LoadMethod } from '../lib/metrics.js';
import { db } from './index.js';

/**
 * Requêtes des sorties copiées dans l'app (migration 009). Toutes filtrées par
 * `user_id` : la barrière d'isolation, comme dans repo.ts. Les `numeric` et
 * `bigint` peuvent revenir en chaîne depuis pg : converties ici.
 */

export type StreamsStatus = 'missing' | 'stored' | 'none' | 'error';

/** Sortie telle que stockée (résumé Intervals + calculs de l'app). */
export interface ActivityRecord {
  id: string;
  startLocal: string;
  sport: string | null;
  typeRaw: string | null;
  name: string | null;
  movingSecs: number | null;
  distanceM: number | null;
  elevationM: number | null;
  avgHr: number | null;
  avgWatts: number | null;
  avgCadence: number | null;
  icuLoad: number | null;
  icuWeightedWatts: number | null;
  /** Fraction (0,853). */
  icuIntensity: number | null;
  icuRaw: unknown;
  weightedWatts: number | null;
  intensity: number | null;
  load: number | null;
  loadMethod: LoadMethod | null;
  ftpUsed: number | null;
  lthrUsed: number | null;
  powerZoneSecs: number[] | null;
  hrZoneSecs: number[] | null;
  streamsStatus: StreamsStatus;
}

/** Résumé d'une sortie, tel que reçu d'Intervals.icu (sans calcul). */
export interface SummaryRecord {
  id: string;
  startUtc: string | null;
  startLocal: string;
  sport: string | null;
  typeRaw: string | null;
  name: string | null;
  movingSecs: number | null;
  distanceM: number | null;
  elevationM: number | null;
  avgHr: number | null;
  avgWatts: number | null;
  avgCadence: number | null;
  icuLoad: number | null;
  icuWeightedWatts: number | null;
  icuIntensity: number | null;
  icuRaw: unknown;
}

/** Résultats des calculs d'une sortie. */
export interface ComputedRecord {
  weightedWatts: number | null;
  intensity: number | null;
  load: number | null;
  loadMethod: LoadMethod;
  ftpUsed: number | null;
  lthrUsed: number | null;
  powerZoneSecs: number[] | null;
  hrZoneSecs: number[] | null;
  bests: Array<{ secs: number; watts: number }>;
}

/** Meilleure puissance d'une sortie sur une durée, avec la sortie d'origine. */
export interface BestRecord {
  activityId: string;
  name: string | null;
  startLocal: string;
  secs: number;
  watts: number;
}

interface ActivityRow {
  id: string;
  start_local: string;
  sport: string | null;
  type_raw: string | null;
  name: string | null;
  moving_secs: number | null;
  distance_m: string | null;
  elevation_m: string | null;
  avg_hr: number | null;
  avg_watts: number | null;
  avg_cadence: number | null;
  icu_load: string | null;
  icu_weighted_watts: number | null;
  icu_intensity: string | null;
  icu_raw: unknown;
  weighted_watts: number | null;
  intensity: string | null;
  load: string | null;
  load_method: LoadMethod | null;
  ftp_used: number | null;
  lthr_used: number | null;
  power_zone_secs: number[] | null;
  hr_zone_secs: number[] | null;
  streams_status: StreamsStatus;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

function toRecord(r: ActivityRow): ActivityRecord {
  return {
    id: r.id,
    startLocal: r.start_local,
    sport: r.sport,
    typeRaw: r.type_raw,
    name: r.name,
    movingSecs: r.moving_secs,
    distanceM: num(r.distance_m),
    elevationM: num(r.elevation_m),
    avgHr: r.avg_hr,
    avgWatts: r.avg_watts,
    avgCadence: r.avg_cadence,
    icuLoad: num(r.icu_load),
    icuWeightedWatts: r.icu_weighted_watts,
    icuIntensity: num(r.icu_intensity),
    icuRaw: r.icu_raw,
    weightedWatts: r.weighted_watts,
    intensity: num(r.intensity),
    load: num(r.load),
    loadMethod: r.load_method,
    ftpUsed: r.ftp_used,
    lthrUsed: r.lthr_used,
    powerZoneSecs: r.power_zone_secs,
    hrZoneSecs: r.hr_zone_secs,
    streamsStatus: r.streams_status,
  };
}

const COLUMNS = `id, start_local, sport, type_raw, name, moving_secs, distance_m, elevation_m, avg_hr, avg_watts, avg_cadence,
  icu_load, icu_weighted_watts, icu_intensity, icu_raw, weighted_watts, intensity, load, load_method, ftp_used, lthr_used,
  power_zone_secs, hr_zone_secs, streams_status`;

/** Identifiant de l'utilisateur (uuid) d'un athlète Intervals.icu, ou null s'il n'est pas connecté. */
export async function userIdOfAthlete(athleteId: string): Promise<string | null> {
  const { rows } = await db().query<{ id: string }>('select id from users where intervals_athlete_id = $1', [athleteId]);
  return rows[0]?.id ?? null;
}

/** Enregistre ou met à jour les résumés. Les calculs et l'état des courbes ne sont pas écrasés. */
export async function upsertSummaries(userId: string, rows: SummaryRecord[]): Promise<void> {
  if (rows.length === 0) return;
  await db().transaction(async (tx) => {
    for (const r of rows) {
      await tx.query(
        `insert into activities (user_id, id, source, start_utc, start_local, sport, type_raw, name, moving_secs, distance_m, elevation_m,
                                 avg_hr, avg_watts, avg_cadence, icu_load, icu_weighted_watts, icu_intensity, icu_raw, updated_at)
         values ($1, $2, 'intervals', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, now())
         on conflict (user_id, id) do update set
           start_utc = excluded.start_utc, start_local = excluded.start_local, sport = excluded.sport, type_raw = excluded.type_raw,
           name = excluded.name, moving_secs = excluded.moving_secs, distance_m = excluded.distance_m, elevation_m = excluded.elevation_m,
           avg_hr = excluded.avg_hr, avg_watts = excluded.avg_watts, avg_cadence = excluded.avg_cadence, icu_load = excluded.icu_load,
           icu_weighted_watts = excluded.icu_weighted_watts, icu_intensity = excluded.icu_intensity, icu_raw = excluded.icu_raw,
           updated_at = now()`,
        [
          userId,
          r.id,
          r.startUtc,
          r.startLocal,
          r.sport,
          r.typeRaw,
          r.name,
          r.movingSecs,
          r.distanceM,
          r.elevationM,
          r.avgHr,
          r.avgWatts,
          r.avgCadence,
          r.icuLoad,
          r.icuWeightedWatts,
          r.icuIntensity,
          JSON.stringify(r.icuRaw ?? null),
        ],
      );
    }
  });
}

/** Sorties dont le jour de départ est entre `from` et `to` (inclus, AAAA-MM-JJ). */
export async function listActivities(userId: string, from: string, to: string): Promise<ActivityRecord[]> {
  const { rows } = await db().query<ActivityRow>(
    `select ${COLUMNS} from activities where user_id = $1 and start_local >= $2 and start_local < $3 order by start_local desc`,
    [userId, `${from}T00:00:00`, `${nextDay(to)}T00:00:00`],
  );
  return rows.map(toRecord);
}

export async function getActivity(userId: string, id: string): Promise<ActivityRecord | null> {
  const { rows } = await db().query<ActivityRow>(`select ${COLUMNS} from activities where user_id = $1 and id = $2`, [userId, id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

/** Sorties dont les courbes sont stockées (pour le recalcul). */
export async function storedActivities(userId: string, limit: number): Promise<ActivityRecord[]> {
  const { rows } = await db().query<ActivityRow>(
    `select ${COLUMNS} from activities where user_id = $1 and streams_status = 'stored' order by start_local desc limit $2`,
    [userId, limit],
  );
  return rows.map(toRecord);
}

/** Identifiants des sorties sans courbes encore récupérées, les plus récentes d'abord. */
export async function missingActivityIds(userId: string, limit: number): Promise<string[]> {
  const { rows } = await db().query<{ id: string }>(
    `select id from activities where user_id = $1 and streams_status = 'missing' order by start_local desc limit $2`,
    [userId, limit],
  );
  return rows.map((r) => r.id);
}

/** Nombre de sorties dont le jour de départ est à partir de `from` (AAAA-MM-JJ). */
export async function countActivitiesFrom(userId: string, from: string): Promise<number> {
  const { rows } = await db().query<{ n: string | number }>(
    `select count(*) as n from activities where user_id = $1 and start_local >= $2`,
    [userId, `${from}T00:00:00`],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function setStreamsStatus(userId: string, id: string, status: StreamsStatus): Promise<void> {
  await db().query(`update activities set streams_status = $3, updated_at = now() where user_id = $1 and id = $2`, [userId, id, status]);
}

/** Courbes compressées d'une sortie (gzip du JSON) ; remplace les précédentes. */
export async function saveStreams(userId: string, id: string, data: Buffer, points: number): Promise<void> {
  await db().query(
    `insert into activity_streams (user_id, activity_id, data, points) values ($1, $2, $3, $4)
     on conflict (user_id, activity_id) do update set data = excluded.data, points = excluded.points, created_at = now()`,
    [userId, id, data, points],
  );
}

export async function loadStreams(userId: string, id: string): Promise<Buffer | null> {
  const { rows } = await db().query<{ data: Buffer }>(`select data from activity_streams where user_id = $1 and activity_id = $2`, [userId, id]);
  return rows[0]?.data ?? null;
}

/** Écrit les calculs, l'état des courbes et les meilleures puissances, en une transaction. */
export async function saveComputed(userId: string, id: string, c: ComputedRecord, status: StreamsStatus): Promise<void> {
  await db().transaction(async (tx) => {
    await tx.query(
      `update activities set weighted_watts = $3, intensity = $4, load = $5, load_method = $6, ftp_used = $7, lthr_used = $8,
         power_zone_secs = $9, hr_zone_secs = $10, streams_status = $11, computed_at = now(), updated_at = now()
       where user_id = $1 and id = $2`,
      [userId, id, c.weightedWatts, c.intensity, c.load, c.loadMethod, c.ftpUsed, c.lthrUsed, c.powerZoneSecs, c.hrZoneSecs, status],
    );
    await tx.query(`delete from activity_bests where user_id = $1 and activity_id = $2`, [userId, id]);
    if (c.bests.length > 0) {
      await tx.query(
        `insert into activity_bests (user_id, activity_id, secs, watts)
         select $1, $2, unnest($3::int[]), unnest($4::int[])`,
        [userId, id, c.bests.map((b) => b.secs), c.bests.map((b) => b.watts)],
      );
    }
  });
}

/** Meilleures puissances de toutes les sorties dont le jour est entre `from` et `to`. */
export async function bestsInWindow(userId: string, from: string, to: string): Promise<BestRecord[]> {
  const { rows } = await db().query<{ activity_id: string; name: string | null; start_local: string; secs: number; watts: number }>(
    `select b.activity_id, a.name, a.start_local, b.secs, b.watts
     from activity_bests b join activities a on a.user_id = b.user_id and a.id = b.activity_id
     where b.user_id = $1 and a.start_local >= $2 and a.start_local < $3`,
    [userId, `${from}T00:00:00`, `${nextDay(to)}T00:00:00`],
  );
  return rows.map((r) => ({ activityId: r.activity_id, name: r.name, startLocal: r.start_local, secs: r.secs, watts: r.watts }));
}

/** Lendemain d'une date AAAA-MM-JJ. */
function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
