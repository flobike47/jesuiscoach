import type { BestRecord } from '../db/activityRepo.js';
import type { IntervalsStream } from '../types.js';
import type { PowerModel, PowerRecord, PowerView } from './dashboards.js';

/**
 * Calculs de l'app sur les courbes d'une sortie (puissance, cardio, vitesse).
 * Fonctions pures, sans base ni réseau : les seuils viennent de la fiche profil
 * (ou, à défaut, d'Intervals.icu). Vocabulaire : Charge, Puissance pondérée, Intensité.
 *
 * Règles de ré-échantillonnage (elles changent les chiffres, donc documentées) :
 *  - une seconde sans mesure est comblée par la dernière valeur connue si le trou
 *    fait au plus MAX_GAP_SECS secondes ;
 *  - au-delà, c'est une pause : elle ne compte ni dans les zones, ni dans la moyenne
 *    glissante de la puissance pondérée, ni dans le temps en mouvement, et vaut 0 W
 *    dans les meilleures puissances.
 */

/** Trou (secondes sans mesure) comblé par répétition de la dernière valeur. */
export const MAX_GAP_SECS = 5;
/** Fenêtre de la puissance pondérée (secondes). */
export const WEIGHTED_WINDOW = 30;
/** Durées des meilleures puissances stockées par sortie. */
export const BEST_SECS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800, 14400] as const;
/** Bornes hautes des zones de puissance (Coggan, % FTP) : Z1…Z6 ; Z7 au-delà. */
export const POWER_ZONE_UPPER = [55, 75, 90, 105, 120, 150] as const;
/** Bornes hautes des zones cardio (Friel, % FC seuil) : Z1…Z4 ; Z5 au-delà. */
export const HR_ZONE_UPPER = [81, 90, 94, 100] as const;
/** Vitesse « en mouvement » minimale (m/s), comme dans la charge à l'allure. */
const MOVING_SPEED = 0.5;

/** Séries d'une sortie, alignées sur `time` (secondes depuis le départ, trous possibles). */
export interface RawSeries {
  time: number[];
  watts: Array<number | null> | null;
  heartrate: Array<number | null> | null;
  cadence: Array<number | null> | null;
  /** Vitesse en m/s. */
  velocity: Array<number | null> | null;
  distance: Array<number | null> | null;
  altitude: Array<number | null> | null;
}

/** Seuils utilisés pour un sport donné. */
export interface Thresholds {
  ftp: number | null;
  lthr: number | null;
  maxHr: number | null;
  restingHr: number | null;
  /** Allure seuil en m/s (course : 1000 / s par km ; natation : 100 / s par 100 m). */
  thresholdSpeed: number | null;
}

export type LoadMethod = 'power' | 'hr' | 'pace' | 'none';

export interface ActivityMetrics {
  weightedWatts: number | null;
  /** Fraction (0,853). */
  intensity: number | null;
  load: number | null;
  loadMethod: LoadMethod;
  powerZoneSecs: number[] | null;
  hrZoneSecs: number[] | null;
  bests: Array<{ secs: number; watts: number }>;
  movingSecs: number;
}

/** Un point par seconde, de la première mesure à la dernière. */
export interface Second {
  watts: number | null;
  hr: number | null;
  speed: number | null;
  /** Vrai hors pause (mesure réelle ou trou comblé). */
  live: boolean;
}

/** Convertit les streams Intervals.icu (un tableau par type) en séries alignées. */
export function seriesFromStreams(streams: IntervalsStream[]): RawSeries {
  const pick = (type: string) => streams.find((s) => s.type === type)?.data ?? null;
  const time = pick('time') ?? [];
  const keep: number[] = [];
  time.forEach((t, i) => {
    if (t != null && Number.isFinite(t)) keep.push(i);
  });
  const channel = (type: string) => {
    const data = pick(type);
    return data ? keep.map((i) => data[i] ?? null) : null;
  };
  return {
    time: keep.map((i) => Number(time[i])),
    watts: channel('watts'),
    heartrate: channel('heartrate'),
    cadence: channel('cadence'),
    velocity: channel('velocity_smooth'),
    distance: channel('distance'),
    altitude: channel('altitude'),
  };
}

/** Ré-échantillonne à 1 Hz (voir les règles en tête de fichier). */
export function toSeconds(s: RawSeries): Second[] {
  const n = s.time.length;
  if (n === 0) return [];
  const t0 = Math.round(s.time[0]);
  const tEnd = Math.round(s.time[n - 1]);
  const out: Second[] = [];
  let p = 0;
  for (let t = t0; t <= tEnd; t++) {
    while (p + 1 < n && Math.round(s.time[p + 1]) <= t) p++;
    const at = Math.round(s.time[p]);
    // Longueur totale du trou : secondes entre la mesure courante et la suivante.
    const nextT = p + 1 < n ? Math.round(s.time[p + 1]) : Infinity;
    const hole = nextT - at - 1;
    if (at !== t && hole > MAX_GAP_SECS) {
      out.push({ watts: null, hr: null, speed: null, live: false });
      continue;
    }
    out.push({
      watts: s.watts?.[p] ?? null,
      hr: s.heartrate?.[p] ?? null,
      speed: s.velocity?.[p] ?? null,
      live: true,
    });
  }
  return out;
}

const hasChannel = (list: Array<number | null> | null) => list != null && list.some((v) => v != null);

/** Temps en mouvement (s) : puissance > 0 ou vitesse > 0,5 m/s ; sans ces canaux, toute mesure vivante. */
export function movingSecs(secs: Second[], s: RawSeries): number {
  const hasPower = hasChannel(s.watts);
  const hasSpeed = hasChannel(s.velocity);
  if (!hasPower && !hasSpeed) return secs.filter((x) => x.live).length;
  return secs.filter((x) => x.live && ((x.watts ?? 0) > 0 || (x.speed ?? 0) > MOVING_SPEED)).length;
}

/**
 * Puissance pondérée : moyenne glissante de 30 s (pauses exclues), élevée à la
 * puissance 4, moyennée, puis racine quatrième. Null si moins de 30 s de données.
 */
export function weightedPower(secs: Second[]): number | null {
  const n = secs.length;
  const w = WEIGHTED_WINDOW;
  if (n < w) return null;
  const sum = new Array<number>(n + 1).fill(0);
  const cnt = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const v = secs[i].live ? secs[i].watts : null;
    sum[i + 1] = sum[i] + (v ?? 0);
    cnt[i + 1] = cnt[i] + (v != null ? 1 : 0);
  }
  let quartics = 0;
  let windows = 0;
  for (let i = w; i <= n; i++) {
    const c = cnt[i] - cnt[i - w];
    if (c === 0) continue;
    const avg = (sum[i] - sum[i - w]) / c;
    quartics += avg ** 4;
    windows++;
  }
  if (windows === 0) return null;
  return Math.round((quartics / windows) ** 0.25);
}

/** Répartition du temps dans les zones de puissance (Z1…Z7), en secondes. */
export function powerZoneSecs(secs: Second[], ftp: number): number[] {
  const out = new Array<number>(POWER_ZONE_UPPER.length + 1).fill(0);
  for (const x of secs) {
    if (!x.live || x.watts == null) continue;
    const pct = (x.watts / ftp) * 100;
    const zone = POWER_ZONE_UPPER.findIndex((upper) => pct < upper);
    out[zone === -1 ? POWER_ZONE_UPPER.length : zone] += 1;
  }
  return out;
}

/** Répartition du temps dans les zones cardio (Z1…Z5), en secondes. */
export function hrZoneSecs(secs: Second[], lthr: number): number[] {
  const out = new Array<number>(HR_ZONE_UPPER.length + 1).fill(0);
  for (const x of secs) {
    if (!x.live || x.hr == null) continue;
    const pct = (x.hr / lthr) * 100;
    const zone = HR_ZONE_UPPER.findIndex((upper) => pct < upper);
    out[zone === -1 ? HR_ZONE_UPPER.length : zone] += 1;
  }
  return out;
}

/**
 * Meilleure puissance moyenne pour chaque durée (somme glissante, pauses à 0 W).
 * Une durée n'est donnée que si la sortie dure au moins autant.
 */
export function bestAverages(secs: Second[]): Array<{ secs: number; watts: number }> {
  const n = secs.length;
  const prefix = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const x = secs[i];
    prefix[i + 1] = prefix[i] + (x.live && x.watts != null ? x.watts : 0);
  }
  const out: Array<{ secs: number; watts: number }> = [];
  for (const d of BEST_SECS) {
    if (d > n) break;
    let best = 0;
    for (let i = 0; i + d <= n; i++) {
      const avg = (prefix[i + d] - prefix[i]) / d;
      if (avg > best) best = avg;
    }
    out.push({ secs: d, watts: Math.round(best) });
  }
  return out;
}

/** Vitesse moyenne (m/s) sur les secondes en mouvement ; null sans vitesse. */
function averageMovingSpeed(secs: Second[]): number | null {
  let sum = 0;
  let count = 0;
  for (const x of secs) {
    if (x.live && x.speed != null && x.speed > MOVING_SPEED) {
      sum += x.speed;
      count++;
    }
  }
  return count ? sum / count : null;
}

/** Pondération de Banister pour une FC donnée : r = réserve cardiaque relative, borné [0, 1]. */
function banisterWeight(hr: number, rest: number, max: number): number {
  const r = Math.min(1, Math.max(0, (hr - rest) / (max - rest)));
  return r * 0.64 * Math.exp(1.92 * r);
}

/** Repos 60 par défaut, FC max = FC seuil / 0,92 par défaut (comme la fiche). */
function hrBounds(t: Thresholds): { rest: number; max: number } | null {
  if (t.lthr == null) return null;
  const rest = t.restingHr ?? 60;
  const max = t.maxHr ?? t.lthr / 0.92;
  return max > rest ? { rest, max } : null;
}

/** Charge cardio : 1 h à la FC seuil = 100. Null si les bornes manquent. */
export function hrLoad(secs: Second[], t: Thresholds): number | null {
  const b = hrBounds(t);
  if (!b || t.lthr == null) return null;
  const threshold = 60 * banisterWeight(t.lthr, b.rest, b.max);
  if (threshold <= 0) return null;
  let trimp = 0;
  for (const x of secs) {
    if (!x.live || x.hr == null) continue;
    trimp += banisterWeight(x.hr, b.rest, b.max) / 60;
  }
  return (trimp / threshold) * 100;
}

/** Charge à l'allure (course, natation) : heures × (vitesse / vitesse seuil)² × 100. */
export function paceLoad(secs: Second[], thresholdSpeed: number): number | null {
  const avg = averageMovingSpeed(secs);
  if (avg == null || !(thresholdSpeed > 0)) return null;
  const hours = secs.filter((x) => x.live).length / 3600;
  return hours * (avg / thresholdSpeed) ** 2 * 100;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Tous les calculs d'une sortie. Charge : puissance si FTP et puissance
 * utilisables, sinon cardio si FC seuil, sinon allure (course et natation) ;
 * sinon pas de charge (`loadMethod = 'none'`).
 */
export function computeMetrics(series: RawSeries, t: Thresholds, sport: 'Ride' | 'Run' | 'Swim'): ActivityMetrics {
  const secs = toSeconds(series);
  const moving = movingSecs(secs, series);
  const hasWatts = hasChannel(series.watts);
  const hasHr = hasChannel(series.heartrate);
  const pp = hasWatts ? weightedPower(secs) : null;
  const powerOk = pp != null && t.ftp != null && t.ftp > 0;
  const intensity = powerOk ? Math.round((pp / t.ftp!) * 1000) / 1000 : null;

  let load: number | null = null;
  let loadMethod: LoadMethod = 'none';
  if (powerOk) {
    load = round1((moving * pp! * intensity!) / (t.ftp! * 3600) * 100);
    loadMethod = 'power';
  } else {
    const byHr = hasHr ? hrLoad(secs, t) : null;
    const byPace = sport !== 'Ride' && t.thresholdSpeed ? paceLoad(secs, t.thresholdSpeed) : null;
    if (byHr != null) {
      load = round1(byHr);
      loadMethod = 'hr';
    } else if (byPace != null) {
      load = round1(byPace);
      loadMethod = 'pace';
    }
  }

  return {
    weightedWatts: pp,
    intensity,
    load,
    loadMethod,
    powerZoneSecs: hasWatts && t.ftp ? powerZoneSecs(secs, t.ftp) : null,
    hrZoneSecs: hasHr && t.lthr ? hrZoneSecs(secs, t.lthr) : null,
    bests: hasWatts ? bestAverages(secs) : [],
    movingSecs: moving,
  };
}

/* ---------- Courbe de puissance à partir des meilleures puissances stockées ---------- */

/** Durées des records mis en avant (5 s, 1 min, 5 min, 20 min, 1 h). */
const RECORD_SECS = [5, 60, 300, 1200, 3600] as const;
/** Durées du modèle CP / W′ : de 3 à 20 min. */
const MODEL_SECS = [180, 300, 600, 900, 1200] as const;

/**
 * Modèle CP / W′ par moindres carrés sur le travail (W = P × t) : la pente est
 * la CP, l'ordonnée à l'origine le W′. FTP estimée = 95 % de la meilleure 20 min.
 */
export function criticalPowerModel(points: ReadonlyArray<{ secs: number; watts: number }>): PowerModel | null {
  const best20 = points.find((p) => p.secs === 1200)?.watts;
  const ftp = best20 == null ? null : Math.round(best20 * 0.95);
  const pts = points.filter((p) => (MODEL_SECS as readonly number[]).includes(p.secs)).map((p) => ({ t: p.secs, w: p.secs * p.watts }));
  if (pts.length < 2) return ftp == null ? null : { ftp, cp: null, wPrime: null, pMax: null };
  const n = pts.length;
  const sumT = pts.reduce((s, p) => s + p.t, 0);
  const sumW = pts.reduce((s, p) => s + p.w, 0);
  const sumTT = pts.reduce((s, p) => s + p.t * p.t, 0);
  const sumTW = pts.reduce((s, p) => s + p.t * p.w, 0);
  const cp = (n * sumTW - sumT * sumW) / (n * sumTT - sumT * sumT);
  const wPrime = (sumW - cp * sumT) / n;
  return { ftp, cp: Math.round(cp), wPrime: Math.round(wPrime), pMax: null };
}

export interface PowerBestsInput {
  /** Meilleures puissances de chaque fenêtre (90 jours, 1 an). */
  bests: Record<'90d' | '1y', ReadonlyArray<BestRecord>>;
  ftp: number | null;
  weightKg: number | null;
}

/** Même forme que la courbe affichée depuis Intervals.icu (lib/dashboards.ts), calculée depuis la base. */
export function powerFromBests(input: PowerBestsInput): PowerView {
  const bestOf = (range: '90d' | '1y', secs: number): BestRecord | undefined => {
    let top: BestRecord | undefined;
    for (const b of input.bests[range]) {
      if (b.secs !== secs) continue;
      if (!top || b.watts > top.watts || (b.watts === top.watts && b.startLocal > top.startLocal)) top = b;
    }
    return top;
  };
  const curves = {} as PowerView['curves'];
  const records = {} as PowerView['records'];
  const models = {} as PowerView['models'];
  for (const range of ['90d', '1y'] as const) {
    curves[range] = BEST_SECS.flatMap((s) => {
      const b = bestOf(range, s);
      return b ? [{ secs: s, watts: b.watts }] : [];
    });
    records[range] = RECORD_SECS.flatMap((s): PowerRecord[] => {
      const b = bestOf(range, s);
      if (!b) return [];
      const yearBest = range === '90d' && (bestOf('1y', s)?.watts ?? Number.NEGATIVE_INFINITY) <= b.watts;
      return [
        {
          secs: s,
          watts: b.watts,
          wkg: input.weightKg ? Math.round((b.watts / input.weightKg) * 10) / 10 : null,
          activityId: b.activityId,
          activityName: b.name,
          date: b.startLocal.slice(0, 10),
          yearBest,
        },
      ];
    });
    models[range] = criticalPowerModel(curves[range]);
  }
  return { ftp: input.ftp, curves, records, models };
}
