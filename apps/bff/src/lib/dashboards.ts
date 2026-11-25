import { ftpOf, isoDay } from './summary.js';
import type {
  ActivityStreams,
  IntervalsActivity,
  IntervalsActivityDetail,
  IntervalsAthlete,
  IntervalsPowerCurve,
  IntervalsPowerCurves,
  IntervalsStream,
} from '../types.js';

/**
 * Tableaux de bord avancés : on met en forme ce qu'Intervals.icu a déjà
 * calculé (courbes de puissance, temps par zone, intervalles), sans
 * recalcul côté app. Fonctions pures, testées.
 */

const DAY = 24 * 60 * 60 * 1000;

/* ---------- Courbe de puissance ---------- */

/** Durées affichées sur la courbe (axe logarithmique). */
const CURVE_SECS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800, 14400];
/** Records mis en avant : 5 s, 1 min, 5 min, 20 min, 1 h. */
const RECORD_SECS = [5, 60, 300, 1200, 3600];
export const CURVE_RANGES = ['90d', '1y'] as const;
export type CurveRange = (typeof CURVE_RANGES)[number];

export interface CurvePoint {
  secs: number;
  watts: number;
}

export interface PowerRecord {
  secs: number;
  watts: number;
  wkg: number | null;
  activityId: string | null;
  activityName: string | null;
  date: string | null;
  /** Record de l'année établi dans les 90 derniers jours. */
  yearBest: boolean;
}

export interface PowerModel {
  ftp: number | null;
  cp: number | null;
  wPrime: number | null;
  pMax: number | null;
}

export interface PowerView {
  ftp: number | null;
  curves: Record<CurveRange, CurvePoint[]>;
  records: Record<CurveRange, PowerRecord[]>;
  models: Record<CurveRange, PowerModel | null>;
}

function valueAt(curve: IntervalsPowerCurve, secs: number): { watts: number; index: number } | null {
  const watts = curve.watts ?? curve.values ?? [];
  const index = curve.secs.indexOf(secs);
  if (index < 0 || !(watts[index] > 0)) return null;
  return { watts: Math.round(watts[index]), index };
}

/**
 * Modèle de puissance : « ECP » (CP étendue) en priorité, sinon le premier
 * disponible. Donne la FTP estimée, la CP, le W′ et la puissance maximale.
 */
function modelOf(curve: IntervalsPowerCurve | undefined): PowerModel | null {
  const models = curve?.powerModels ?? [];
  const m = models.find((x) => x.type === 'ECP') ?? models[0];
  if (!m) return null;
  const r = (v: number | null | undefined) => (v == null ? null : Math.round(v));
  return { ftp: r(m.ftp), cp: r(m.criticalPower), wPrime: r(m.wPrime), pMax: r(m.pMax) };
}

export function powerView(data: IntervalsPowerCurves, athlete: IntervalsAthlete): PowerView {
  const byId = (id: CurveRange) => data.list.find((c) => c.id === id);
  const year = byId('1y');
  const curves = {} as PowerView['curves'];
  const records = {} as PowerView['records'];
  const models = {} as PowerView['models'];

  for (const range of CURVE_RANGES) {
    const curve = byId(range);
    curves[range] = curve ? CURVE_SECS.flatMap((s) => (valueAt(curve, s) ? [{ secs: s, watts: valueAt(curve, s)!.watts }] : [])) : [];
    records[range] = curve
      ? RECORD_SECS.flatMap((s) => {
          const v = valueAt(curve, s);
          if (!v) return [];
          const activityId = curve.activity_id?.[v.index] ?? null;
          const activity = activityId ? data.activities?.[activityId] : undefined;
          const wkg = curve.watts_per_kg?.[v.index];
          const best = year ? valueAt(year, s)?.watts : undefined;
          return [
            {
              secs: s,
              watts: v.watts,
              wkg: wkg ? Math.round(wkg * 10) / 10 : null,
              activityId,
              activityName: activity?.name ?? null,
              date: activity?.start_date_local?.slice(0, 10) ?? null,
              yearBest: range === '90d' && best != null && v.watts >= best,
            },
          ];
        })
      : [];
    models[range] = modelOf(curve);
  }
  return { ftp: ftpOf(athlete), curves, records, models };
}

/* ---------- Zones ---------- */

export const ZONE_NAMES = ['Récupération', 'Endurance', 'Tempo', 'Seuil', 'VO2max', 'Anaérobie', 'Neuromusculaire'];

export interface ZoneRange {
  name: string;
  from: number;
  /** null = sans limite haute. */
  to: number | null;
}

export interface ZonesWeek {
  /** Lundi de la semaine (AAAA-MM-JJ). */
  week: string;
  /** Secondes par zone de puissance (Z1…Z7). */
  power: number[];
  /** Secondes par zone cardio. */
  hr: number[];
  /** Temps de sortie total (s), zones connues ou non. */
  movingTime: number;
}

export interface ZonesView {
  weeks: ZonesWeek[];
  ftp: number | null;
  powerZones: ZoneRange[];
  hrZones: ZoneRange[];
  sweetSpot: { from: number; to: number } | null;
  /** Sorties de la période avec des données de puissance / cardio. */
  ridesWithPower: number;
  ridesWithHr: number;
  rides: number;
}

export function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return isoDay(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY));
}

/** Temps par zone, quelle que soit la forme reçue : `[{ id: 'Z1', secs }]` ou `[secs, …]`. */
function zoneSeconds(list: Array<number | { id: string; secs: number }> | null | undefined, count: number): number[] | null {
  if (!list?.length) return null;
  const out = new Array<number>(count).fill(0);
  list.forEach((z, i) => {
    if (typeof z === 'number') {
      if (i < count) out[i] += z;
      return;
    }
    const m = /^Z(\d)$/.exec(z.id);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= count) out[Number(m[1]) - 1] += z.secs;
  });
  return out.some((s) => s > 0) ? out : null;
}

/** Bornes hautes (en watts ou en bpm) → plages lisibles. */
function ranges(upper: number[], toUnit: (v: number) => number): ZoneRange[] {
  return upper.slice(0, ZONE_NAMES.length).map((u, i) => ({
    name: ZONE_NAMES[i],
    from: i === 0 ? 0 : toUnit(upper[i - 1]) + 1,
    to: u >= 999 || i === upper.length - 1 ? null : toUnit(u),
  }));
}

export function zonesView(activities: IntervalsActivity[], athlete: IntervalsAthlete, weeks: number, now: Date): ZonesView {
  const ride = athlete.sportSettings?.find((s) => s.types?.includes('Ride'));
  const ftp = ftpOf(athlete);
  const thisMonday = mondayOf(isoDay(now));
  const list: ZonesWeek[] = Array.from({ length: weeks }, (_, i) => ({
    week: isoDay(new Date(Date.parse(`${thisMonday}T12:00:00Z`) - (weeks - 1 - i) * 7 * DAY)),
    power: new Array<number>(7).fill(0),
    hr: new Array<number>(7).fill(0),
    movingTime: 0,
  }));
  const byWeek = new Map(list.map((w) => [w.week, w]));

  let rides = 0;
  let ridesWithPower = 0;
  let ridesWithHr = 0;
  for (const a of activities) {
    if (!(a.type ?? '').includes('Ride')) continue;
    const week = byWeek.get(mondayOf(a.start_date_local.slice(0, 10)));
    if (!week) continue;
    rides++;
    week.movingTime += a.moving_time ?? 0;
    const power = zoneSeconds(a.icu_zone_times, 7);
    const hr = zoneSeconds(a.icu_hr_zone_times, 7);
    if (power) {
      ridesWithPower++;
      power.forEach((s, i) => (week.power[i] += s));
    }
    if (hr) {
      ridesWithHr++;
      hr.forEach((s, i) => (week.hr[i] += s));
    }
  }

  const pct = (v: number) => Math.round(((ftp ?? 0) * v) / 100);
  return {
    weeks: list,
    ftp,
    powerZones: ftp && ride?.power_zones?.length ? ranges(ride.power_zones, pct) : [],
    hrZones: ride?.hr_zones?.length ? ranges(ride.hr_zones, (v) => v) : [],
    sweetSpot: ftp && ride?.sweet_spot_min && ride.sweet_spot_max ? { from: pct(ride.sweet_spot_min), to: pct(ride.sweet_spot_max) } : null,
    ridesWithPower,
    ridesWithHr,
    rides,
  };
}

/* ---------- Détail d'une sortie ---------- */

/** Points affichés au plus par courbe (le téléphone n'en montre pas davantage). */
export const MAX_STREAM_POINTS = 400;

/**
 * Réduit les streams (un point par seconde, ~10 000 pour 3 h) à quelques
 * centaines de points, en moyennant chaque paquet. Les trous (null) restent
 * des trous ; un stream absent ou vide devient null.
 */
export function downsampleStreams(streams: IntervalsStream[], maxPoints = MAX_STREAM_POINTS): ActivityStreams {
  const get = (type: string) => streams.find((s) => s.type === type)?.data ?? null;
  const time = get('time') ?? [];
  const n = time.length;
  const step = Math.max(1, Math.ceil(n / maxPoints));
  const reduce = (data: Array<number | null> | null) => {
    if (!data || data.every((v) => v == null)) return null;
    const out: Array<number | null> = [];
    for (let i = 0; i < n; i += step) {
      let sum = 0;
      let count = 0;
      for (let j = i; j < Math.min(n, i + step); j++) {
        const v = data[j];
        if (v != null) {
          sum += v;
          count++;
        }
      }
      out.push(count ? Math.round(sum / count) : null);
    }
    return out;
  };
  const times: number[] = [];
  for (let i = 0; i < n; i += step) times.push(Number(time[i] ?? i));
  return { step, time: times, watts: reduce(get('watts')), heartrate: reduce(get('heartrate')) };
}

export interface IntervalView {
  label: string;
  /** Début et fin, en secondes depuis le départ (même repère que `time`). */
  start: number;
  end: number;
  duration: number;
  watts: number | null;
  weightedWatts: number | null;
  heartrate: number | null;
  cadence: number | null;
  zone: number | null;
}

export interface ActivityView {
  activity: {
    id: string;
    name: string;
    date: string;
    type: string | null;
    movingTime: number | null;
    distance: number | null;
    elevation: number | null;
    load: number | null;
    weightedWatts: number | null;
    averageWatts: number | null;
    /** Intensité en fraction (0,90), comme ailleurs dans l'app. */
    intensity: number | null;
    heartrate: number | null;
    decoupling: number | null;
    ftp: number | null;
  };
  streams: ActivityStreams;
  intervals: IntervalView[];
  powerZones: number[] | null;
  hrZones: number[] | null;
}

export function activityView(detail: IntervalsActivityDetail, streams: ActivityStreams): ActivityView {
  const timeAt = (index: number) => streams.time[Math.min(streams.time.length - 1, Math.floor(index / streams.step))] ?? 0;
  const work = (detail.icu_intervals ?? []).filter((iv) => iv.type === 'WORK');
  const r = (v: number | null | undefined) => (v == null ? null : Math.round(v));
  return {
    activity: {
      id: String(detail.id),
      name: detail.name ?? 'Sortie',
      date: detail.start_date_local,
      type: detail.type ?? null,
      movingTime: detail.moving_time ?? null,
      distance: detail.distance ?? null,
      elevation: r(detail.total_elevation_gain),
      load: r(detail.icu_training_load),
      weightedWatts: r(detail.icu_weighted_avg_watts),
      averageWatts: r(detail.icu_average_watts),
      intensity: detail.icu_intensity == null ? null : Math.round(detail.icu_intensity) / 100,
      heartrate: r(detail.average_heartrate),
      decoupling: detail.decoupling == null ? null : Math.round(detail.decoupling * 10) / 10,
      ftp: detail.icu_ftp ?? null,
    },
    streams,
    intervals: work.map((iv, i) => ({
      label: iv.label || `Intervalle ${i + 1}`,
      start: streams.time.length ? timeAt(iv.start_index) : 0,
      end: streams.time.length ? timeAt(iv.end_index) : 0,
      duration: iv.moving_time ?? iv.elapsed_time ?? 0,
      watts: r(iv.average_watts),
      weightedWatts: r(iv.weighted_average_watts),
      heartrate: r(iv.average_heartrate),
      cadence: r(iv.average_cadence),
      zone: iv.zone ?? null,
    })),
    powerZones: zoneSeconds(detail.icu_zone_times, 7),
    hrZones: zoneSeconds(detail.icu_hr_zone_times, 7),
  };
}
