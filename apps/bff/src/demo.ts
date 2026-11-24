import { isoDay } from './lib/summary.js';
import type { IntervalsActivity, IntervalsAthlete, IntervalsEvent, IntervalsWellness, NewWorkoutEvent } from './types.js';

/**
 * Données fictives stables pour 10 cyclistes (mode démo, DEMO_MODE=true).
 * Mêmes formes que les réponses Intervals.icu : le reste du BFF ne fait
 * pas la différence. Profils : régulier, surcharge, inactif, en reprise, léger.
 */

const NAMES = ['Florian', 'Julie', 'Paul', 'Sarah', 'Thomas', 'Léa', 'Hugo', 'Camille', 'Maxime', 'Inès'];
const RIDE_NAMES = ['Sortie endurance', 'Sweet spot 3×12', 'Sortie club', 'Col du coin', 'Récupération', 'Seuil 3×10', 'VO2max 5×4'];
const DAY = 24 * 60 * 60 * 1000;

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
    info: { id: `demo-${k}`, name: NAMES[k], sportSettings: [{ types: ['Ride', 'VirtualRide'], ftp }] },
    wellness,
    activities,
    events,
  };
}

const between = <T,>(xs: T[], key: (x: T) => string, oldest: string, newest: string) =>
  xs.filter((x) => key(x).slice(0, 10) >= oldest && key(x).slice(0, 10) <= newest);

export class DemoSource {
  private athletes: DemoAthlete[];

  constructor(now = new Date()) {
    this.athletes = NAMES.map((_, k) => simulate(k, now));
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
    const ev = { id: `demo-new-${Date.now()}`, category: 'WORKOUT', type: 'Ride', start_date_local: `${w.date}T00:00:00`, name: w.name, description: w.description };
    this.get(id).events.push(ev);
    return ev;
  }
}
