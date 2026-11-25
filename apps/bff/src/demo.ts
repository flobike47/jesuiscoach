import { isoDay } from './lib/summary.js';
import type { CheckinRow } from './db/repo.js';
import { downsampleStreams } from './lib/dashboards.js';
import type {
  ActivityStreams,
  IntervalsActivity,
  IntervalsActivityDetail,
  IntervalsAthlete,
  IntervalsEvent,
  IntervalsFolder,
  IntervalsInterval,
  IntervalsPowerCurves,
  IntervalsStream,
  IntervalsWellness,
  NewWorkoutEvent,
} from './types.js';

/**
 * Données fictives stables pour 10 cyclistes (mode démo, DEMO_MODE=true).
 * Mêmes formes que les réponses Intervals.icu : le reste du BFF ne fait
 * pas la différence. Profils : régulier, surcharge, inactif, en reprise, léger.
 */

const NAMES = ['Florian', 'Julie', 'Paul', 'Sarah', 'Thomas', 'Léa', 'Hugo', 'Camille', 'Maxime', 'Inès'];
const RIDE_NAMES = ['Sortie endurance', 'Sweet spot 3×12', 'Sortie club', 'Col du coin', 'Récupération', 'Seuil 3×10', 'VO2max 5×4'];
const DAY = 24 * 60 * 60 * 1000;
const POWER_ZONES = [55, 75, 90, 105, 120, 150, 999];
const HR_ZONES = [130, 148, 160, 170, 178, 185, 195];

/**
 * Temps par zone d'une sortie démo, déduit de son intensité (sans tirage
 * aléatoire : le reste de la démo ne change pas). Plus l'intensité est
 * haute, plus le temps glisse vers les zones hautes.
 */
function demoZones(seconds: number, intensity: number) {
  const t = Math.min(1, Math.max(0, (intensity - 0.6) / 0.3));
  const power = [0.35 - 0.15 * t, 0.4 - 0.15 * t, 0.12 + 0.05 * t, 0.07 + 0.12 * t, 0.03 + 0.08 * t, 0.02 + 0.03 * t, 0.01 + 0.02 * t];
  const hr = [0.3 - 0.15 * t, 0.4 - 0.1 * t, 0.15 + 0.05 * t, 0.1 + 0.12 * t, 0.05 + 0.08 * t, 0, 0];
  return {
    icu_zone_times: power.map((w, i) => ({ id: `Z${i + 1}`, secs: Math.round(w * seconds) })),
    icu_hr_zone_times: hr.map((w) => Math.round(w * seconds)),
  };
}

/** Graine stable tirée d'un identifiant (même sortie démo → mêmes courbes). */
function seedOf(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** PRNG déterministe (mulberry32) : la démo est identique à chaque démarrage. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoAthlete {
  info: IntervalsAthlete;
  wellness: IntervalsWellness[];
  activities: IntervalsActivity[];
  events: IntervalsEvent[];
}

function simulate(k: number, now: Date): DemoAthlete {
  const r = rng(k * 7919 + 1);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const ftp = pick([210, 230, 245, 260, 275, 290, 310]);
  const profile = k % 5;
  let ctl = 35 + r() * 30;
  let atl = ctl;
  const wellness: IntervalsWellness[] = [];
  const activities: IntervalsActivity[] = [];
  const events: IntervalsEvent[] = [];

  for (let d = 120; d >= 0; d--) {
    const day = new Date(now.getTime() - d * DAY);
    const date = isoDay(day);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    let prob = [0.6, 0.8, 0.55, 0.35 + (120 - d) / 300, 0.4][profile];
    if (profile === 2 && d < 11) prob = 0;
    if (profile === 1 && d < 12) prob = 0.85;
    let load = 0;
    if (r() < prob) {
      let hours = 0.8 + r() * 1.4 + (weekend ? 1.8 : 0);
      let intensity = 0.62 + r() * 0.28;
      if (profile === 1 && d < 12) {
        hours *= 1.05;
        intensity = Math.min(0.9, intensity + 0.02);
      } else if (profile === 1) {
        hours *= 0.7;
      }
      load = Math.round(hours * intensity ** 2 * 100);
      activities.push({
        id: `demo-${k}-${d}`,
        start_date_local: `${date}T${String(7 + Math.floor(r() * 12)).padStart(2, '0')}:00:00`,
        type: 'Ride',
        name: pick(RIDE_NAMES),
        moving_time: Math.round(hours * 3600),
        distance: Math.round(hours * (26 + r() * 7) * 1000),
        icu_training_load: load,
        icu_weighted_avg_watts: Math.round(ftp * intensity),
        icu_intensity: Math.round(intensity * 1000) / 10,
        average_heartrate: 125 + Math.floor(r() * 33),
        ...demoZones(Math.round(hours * 3600), intensity),
      });
    }
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
    wellness.push({ id: date, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10 });
    if (d <= 7 && [2, 4, 6].includes(day.getUTCDay())) {
      events.push({ id: `demo-ev-${k}-${d}`, category: 'WORKOUT', type: 'Ride', start_date_local: `${date}T00:00:00`, name: 'Séance prévue' });
    }
  }
  wellness.forEach((w, i) => {
    const past = wellness[Math.max(0, i - 7)].ctl ?? 0;
    w.rampRate = Math.round(((w.ctl ?? 0) - past) * 10) / 10;
  });

  return {
    info: {
      id: `demo-${k}`,
      name: NAMES[k],
      icu_weight: 62 + k * 2,
      // Réglages de connexion variés : la démo athlète (Julie, k = 1) a une étape à faire.
      // Garmin pour la plupart, un Wahoo et un Coros pour varier.
      icu_garmin_sync_activities: k !== 3 && k !== 5,
      icu_garmin_upload_workouts: k % 2 === 0 && k !== 3 && k !== 5,
      wahoo_sync_activities: k === 3,
      wahoo_upload_workouts: k === 3,
      coros_sync_activities: k === 5,
      coros_upload_workouts: false,
      strava_authorized: k % 3 === 0,
      sportSettings: [{ types: ['Ride', 'VirtualRide'], ftp, power_zones: POWER_ZONES, hr_zones: HR_ZONES, sweet_spot_min: 84, sweet_spot_max: 97 }],
    },
    wellness,
    activities,
    events,
  };
}

const between = <T,>(xs: T[], key: (x: T) => string, oldest: string, newest: string) =>
  xs.filter((x) => key(x).slice(0, 10) >= oldest && key(x).slice(0, 10) <= newest);

export class DemoSource {
  private athletes: DemoAthlete[];
  private checkins = new Map<string, CheckinRow[]>();

  saveCheckin(athleteId: string, c: CheckinRow): void {
    const list = (this.checkins.get(athleteId) ?? []).filter((x) => x.day !== c.day);
    this.checkins.set(athleteId, [c, ...list].sort((a, b) => b.day.localeCompare(a.day)));
  }

  listCheckins(athleteId: string, from: string, to: string): CheckinRow[] {
    return (this.checkins.get(athleteId) ?? []).filter((c) => c.day >= from && c.day <= to);
  }

  constructor(now = new Date()) {
    this.athletes = NAMES.map((_, k) => simulate(k, now));
  }

  /** Ajoute une sortie « qui vient de se terminer » à un athlète démo (test des notifications). */
  simulateRide(athleteId: string, now = new Date()): { name: string; activity: IntervalsActivity } {
    const a = this.get(athleteId);
    const ftp = a.info.sportSettings?.[0]?.ftp ?? 250;
    const pick = RIDE_NAMES[Math.floor(Math.random() * RIDE_NAMES.length)];
    const hours = 1 + Math.round(Math.random() * 20) / 10;
    const intensity = 0.7 + Math.random() * 0.2;
    const activity: IntervalsActivity = {
      id: `demo-sim-${now.getTime()}`,
      start_date_local: now.toISOString().slice(0, 19),
      type: 'Ride',
      name: pick,
      moving_time: Math.round(hours * 3600),
      distance: Math.round(hours * 29 * 1000),
      icu_training_load: Math.round(hours * intensity ** 2 * 100),
      icu_weighted_avg_watts: Math.round(ftp * intensity),
      icu_intensity: Math.round(intensity * 1000) / 10,
      average_heartrate: 145,
      ...demoZones(Math.round(hours * 3600), intensity),
    };
    a.activities.push(activity);
    return { name: a.info.name ?? athleteId, activity };
  }

  athleteIds(): string[] {
    return this.athletes.map((a) => a.info.id);
  }

  private get(id: string): DemoAthlete {
    const a = this.athletes.find((x) => x.info.id === id);
    if (!a) throw Object.assign(new Error('Athlète inconnu'), { statusCode: 404 });
    return a;
  }

  async athlete(id: string) {
    return this.get(id).info;
  }
  async wellness(id: string, oldest: string, newest: string) {
    return between(this.get(id).wellness, (w) => w.id, oldest, newest);
  }
  async activities(id: string, oldest: string, newest: string) {
    return between(this.get(id).activities, (a) => a.start_date_local, oldest, newest).reverse();
  }
  async events(id: string, oldest: string, newest: string) {
    return between(this.get(id).events, (e) => e.start_date_local, oldest, newest);
  }
  async createWorkout(id: string, w: NewWorkoutEvent): Promise<IntervalsEvent> {
    const ev = { id: `demo-new-${Date.now()}`, category: 'WORKOUT', type: w.sport ?? 'Ride', start_date_local: `${w.date}T00:00:00`, name: w.name, description: w.description };
    this.get(id).events.push(ev);
    return ev;
  }
  private event(id: string, eventId: string): IntervalsEvent {
    const ev = this.get(id).events.find((e) => String(e.id) === eventId);
    if (!ev) throw Object.assign(new Error('Séance introuvable'), { statusCode: 404 });
    return ev;
  }
  async moveEvent(id: string, eventId: string, date: string): Promise<IntervalsEvent> {
    const ev = this.event(id, eventId);
    ev.start_date_local = `${date}T00:00:00`;
    return ev;
  }
  async deleteEvent(id: string, eventId: string): Promise<void> {
    this.event(id, eventId);
    const a = this.get(id);
    a.events = a.events.filter((e) => String(e.id) !== eventId);
  }

  /* ---------- Tableaux de bord avancés ---------- */

  private activityOf(id: string, activityId: string): { a: DemoAthlete; activity: IntervalsActivity } {
    const a = this.get(id);
    const activity = a.activities.find((x) => x.id === activityId);
    if (!activity) throw Object.assign(new Error('Sortie introuvable'), { statusCode: 404 });
    return { a, activity };
  }

  /** Séance fictive : échauffement, blocs selon le nom (« 3×10 », « 5×4 »…), retour au calme. */
  private demoRide(id: string, activityId: string) {
    const { a, activity } = this.activityOf(id, activityId);
    const ftp = a.info.sportSettings?.[0]?.ftp ?? 250;
    const r = rng(seedOf(activityId));
    const STEP = 5; // un point toutes les 5 s
    const n = Math.max(60, Math.round((activity.moving_time ?? 3600) / STEP));
    const blocks = /(\d)×(\d+)/.exec(activity.name ?? '');
    const reps = blocks ? Number(blocks[1]) : 0;
    const minutes = blocks ? Number(blocks[2]) : 0;
    const target = /VO2/.test(activity.name ?? '') ? 1.15 : /Sweet/.test(activity.name ?? '') ? 0.9 : 1.0;
    const work: Array<[number, number]> = [];
    let cursor = Math.round((15 * 60) / STEP);
    for (let i = 0; i < reps && cursor < n; i++) {
      const len = Math.round((minutes * 60) / STEP);
      work.push([cursor, Math.min(n - 1, cursor + len)]);
      cursor += len + Math.round(((minutes >= 8 ? 5 : minutes) * 60) / STEP);
    }
    const watts: number[] = [];
    const heartrate: number[] = [];
    let hr = 105;
    for (let i = 0; i < n; i++) {
      const inWork = work.some(([s, e]) => i >= s && i < e);
      const base = inWork ? target : i < 180 / STEP ? 0.5 + (i * STEP) / 600 : 0.62;
      const w = Math.max(0, Math.round(ftp * base * (0.92 + r() * 0.16)));
      hr += (100 + (w / ftp) * 70 - hr) * 0.08;
      watts.push(w);
      heartrate.push(Math.round(hr));
    }
    const avg = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length));
    const intervals: IntervalsInterval[] = work.map(([s, e]) => ({
      type: 'WORK',
      start_index: s,
      end_index: e,
      moving_time: (e - s) * STEP,
      average_watts: avg(watts.slice(s, e)),
      weighted_average_watts: avg(watts.slice(s, e)) + 3,
      average_heartrate: avg(heartrate.slice(s, e)),
      average_cadence: 88 + Math.floor(r() * 8),
      zone: target >= 1.1 ? 5 : target >= 0.95 ? 4 : 3,
      intensity: Math.round(target * 100),
    }));
    const streams: IntervalsStream[] = [
      { type: 'time', data: Array.from({ length: n }, (_, i) => i * STEP) },
      { type: 'watts', data: watts },
      { type: 'heartrate', data: heartrate },
    ];
    return { a, activity, intervals, streams, r };
  }

  async activity(id: string, activityId: string): Promise<IntervalsActivityDetail> {
    const { activity, intervals, r } = this.demoRide(id, activityId);
    return {
      ...activity,
      icu_athlete_id: id,
      icu_average_watts: Math.round((activity.icu_weighted_avg_watts ?? 200) * 0.93),
      total_elevation_gain: Math.round(150 + r() * 900),
      decoupling: Math.round((1 + r() * 6) * 10) / 10,
      icu_intervals: intervals,
    };
  }

  async streams(id: string, activityId: string): Promise<ActivityStreams> {
    return downsampleStreams(this.demoRide(id, activityId).streams);
  }

  async powerCurves(id: string): Promise<IntervalsPowerCurves> {
    const a = this.get(id);
    const k = this.athletes.indexOf(a);
    const ftp = a.info.sportSettings?.[0]?.ftp ?? 250;
    const weight = a.info.icu_weight ?? 70;
    const cp = ftp * 1.03;
    const wPrime = 15000 + k * 800;
    const pMax = ftp * 3.4;
    const secs = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800, 14400];
    // Modèle à 3 paramètres (CP, W′, Pmax) puis lente décroissance au-delà de 20 min.
    const short = (t: number) => cp + wPrime / (t + wPrime / (pMax - cp));
    const model = (t: number) => (t <= 1200 ? short(t) : short(1200) * (1 - 0.07 * Math.log(t / 1200)));
    const rides = [...a.activities].reverse();
    const recent = rides.slice(0, 20);
    const curve = (id90: '90d' | '1y', factor: (t: number) => number, pool: IntervalsActivity[]) => {
      const watts = secs.map((t) => Math.round(model(t) * factor(t)));
      return {
        id: id90,
        secs,
        watts,
        watts_per_kg: watts.map((w) => Math.round((w / weight) * 100) / 100),
        activity_id: secs.map((_, i) => pool[i % Math.max(1, pool.length)]?.id ?? ''),
        weight,
        powerModels: [{ type: 'ECP', criticalPower: Math.round(cp * factor(1200)), wPrime, pMax: Math.round(pMax * factor(1)), ftp: Math.round(cp * factor(1200) * 0.98) }],
      };
    };
    // 1 an un peu au-dessus de 90 jours, sauf certains records récents (20 min).
    const yearFactor = (t: number) => (t === 1200 && k % 2 === 0 ? 1 : 1.04);
    return {
      list: [curve('90d', () => 1, recent), curve('1y', yearFactor, rides)],
      activities: Object.fromEntries(rides.map((x) => [x.id, { id: x.id, name: x.name, start_date_local: x.start_date_local }])),
    };
  }

  /** Bibliothèque fictive du coach démo : deux dossiers de séances. */
  async folders(): Promise<IntervalsFolder[]> {
    return [
      {
        id: 101,
        name: 'Hiver : bases',
        type: 'FOLDER',
        children: [
          { id: 1011, name: 'Endurance 1 h 30 + cadence', type: 'Ride', description: 'Échauffement\n- 10m ramp 50-65%\n\n- 70m 65-72%\n\n- 10m 55%' },
          { id: 1012, name: 'Tempo 2×20', type: 'Ride', description: 'Échauffement\n- 15m ramp 50-75%\n\n2x\n- 20m 80-85%\n- 5m 55%\n\n- 10m 50%' },
          { id: 1013, name: 'Course à pied', type: 'Run', description: '- 40m Z2 Pace' },
        ],
      },
      {
        id: 102,
        name: 'Printemps : intensité',
        type: 'FOLDER',
        children: [
          { id: 1021, name: 'Seuil 2×15', type: 'Ride', description: 'Échauffement\n- 15m ramp 50-75%\n\n2x\n- 15m 98-102%\n- 5m 55%\n\n- 10m 50%' },
          { id: 1022, name: '30/30 × 12', type: 'Ride', description: 'Échauffement\n- 15m ramp 50-75%\n\n12x\n- 30s 130%\n- 30s 50%\n\n- 15m 55%' },
          { id: 1023, name: 'Pignon fixe en cadence', type: 'Ride', description: '- 45m 70% 95rpm' },
          { id: 1024, name: 'Natation 10×100 m', type: 'Swim', description: 'Échauffement\n- 400mtr 70% Pace\n\n10x\n- 100mtr 100% Pace\n- 20s 40% Pace\n\n- 200mtr 65% Pace' },
        ],
      },
    ];
  }
}
