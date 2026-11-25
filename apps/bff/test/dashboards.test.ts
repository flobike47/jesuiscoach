import { describe, expect, it } from 'vitest';
import { activityView, downsampleStreams, mondayOf, powerView, zonesView } from '../src/lib/dashboards.js';
import type { IntervalsActivity, IntervalsAthlete, IntervalsPowerCurve } from '../src/types.js';

const ATHLETE: IntervalsAthlete = {
  id: 'i1',
  sportSettings: [{ types: ['Ride'], ftp: 250, power_zones: [55, 75, 90, 105, 120, 150, 999], hr_zones: [130, 150, 165, 175, 185, 190, 200], sweet_spot_min: 84, sweet_spot_max: 97 }],
};

function curve(id: string, watts: Record<number, number>, extra: Partial<IntervalsPowerCurve> = {}): IntervalsPowerCurve {
  const secs = Object.keys(watts).map(Number);
  return {
    id,
    secs,
    watts: secs.map((s) => watts[s]),
    watts_per_kg: secs.map((s) => watts[s] / 70),
    activity_id: secs.map((s) => `a${s}`),
    ...extra,
  };
}

describe('powerView', () => {
  const data = {
    list: [
      curve('90d', { 5: 800, 60: 440, 300: 310, 1200: 270 }, { powerModels: [{ type: 'MS_2P', ftp: 260 }, { type: 'ECP', ftp: 255.4, criticalPower: 251, wPrime: 18000, pMax: 900 }] }),
      curve('1y', { 5: 850, 60: 450, 300: 320, 1200: 268, 3600: 240 }),
    ],
    activities: { a1200: { id: 'a1200', name: 'Seuil', start_date_local: '2026-11-20T09:00:00' } },
  };

  it('met en avant les records, avec la sortie d’origine et les records de l’année battus', () => {
    const v = powerView(data, ATHLETE);
    expect(v.ftp).toBe(250);
    expect(v.records['90d'].map((r) => r.secs)).toEqual([5, 60, 300, 1200]);
    const twenty = v.records['90d'].find((r) => r.secs === 1200)!;
    expect(twenty).toMatchObject({ watts: 270, wkg: 3.9, activityId: 'a1200', activityName: 'Seuil', date: '2026-11-20', yearBest: true });
    expect(v.records['90d'].find((r) => r.secs === 5)!.yearBest).toBe(false);
    expect(v.records['1y'].every((r) => !r.yearBest)).toBe(true);
  });

  it('choisit le modèle ECP et arrondit', () => {
    expect(powerView(data, ATHLETE).models['90d']).toEqual({ ftp: 255, cp: 251, wPrime: 18000, pMax: 900 });
    expect(powerView(data, ATHLETE).models['1y']).toBeNull();
  });

  it('ne garde que les durées affichées, et supporte une courbe absente', () => {
    const v = powerView({ list: [data.list[0]] }, ATHLETE);
    expect(v.curves['90d'].map((p) => p.secs)).toEqual([5, 60, 300, 1200]);
    expect(v.curves['1y']).toEqual([]);
    expect(v.records['90d'][0].yearBest).toBe(false);
  });
});

describe('zonesView', () => {
  const NOW = new Date('2026-11-25T12:00:00Z'); // mercredi
  const ride = (day: string, extra: Partial<IntervalsActivity>): IntervalsActivity => ({ id: day, start_date_local: `${day}T09:00:00`, type: 'Ride', moving_time: 3600, ...extra });

  it('additionne le temps par zone de chaque semaine (lundi → dimanche)', () => {
    const v = zonesView(
      [
        ride('2026-11-24', { icu_zone_times: [{ id: 'Z1', secs: 600 }, { id: 'Z4', secs: 300 }, { id: 'SS', secs: 999 }] }),
        ride('2026-11-23', { icu_zone_times: [{ id: 'Z1', secs: 100 }], icu_hr_zone_times: [60, 120] }),
        ride('2026-11-22', { icu_zone_times: [{ id: 'Z2', secs: 50 }] }),
        ride('2026-09-01', { icu_zone_times: [{ id: 'Z2', secs: 50 }] }),
        { id: 'run', start_date_local: '2026-11-24T07:00:00', type: 'Run', icu_zone_times: [{ id: 'Z5', secs: 50 }] },
      ],
      ATHLETE,
      2,
      NOW,
    );
    expect(v.weeks.map((w) => w.week)).toEqual(['2026-11-16', '2026-11-23']);
    expect(v.weeks[1].power).toEqual([700, 0, 0, 300, 0, 0, 0]);
    expect(v.weeks[1].hr).toEqual([60, 120, 0, 0, 0, 0, 0]);
    expect(v.weeks[1].movingTime).toBe(7200);
    expect(v.weeks[0].power[1]).toBe(50);
    expect(v).toMatchObject({ rides: 3, ridesWithPower: 3, ridesWithHr: 1 });
  });

  it('traduit les zones de l’athlète en watts et en bpm', () => {
    const v = zonesView([], ATHLETE, 4, NOW);
    expect(v.powerZones[0]).toEqual({ name: 'Récupération', from: 0, to: 138 });
    expect(v.powerZones[1]).toEqual({ name: 'Endurance', from: 139, to: 188 });
    expect(v.powerZones[6]).toEqual({ name: 'Neuromusculaire', from: 376, to: null });
    expect(v.hrZones[3]).toEqual({ name: 'Seuil', from: 166, to: 175 });
    expect(v.sweetSpot).toEqual({ from: 210, to: 243 });
  });

  it('sans FTP, pas de zones de puissance', () => {
    expect(zonesView([], { id: 'i1' }, 4, NOW)).toMatchObject({ powerZones: [], hrZones: [], sweetSpot: null, ftp: null });
  });

  it('mondayOf', () => {
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
  });
});

describe('downsampleStreams', () => {
  it('moyenne par paquets, garde les trous et ignore les streams absents', () => {
    const n = 1000;
    const s = downsampleStreams(
      [
        { type: 'time', data: Array.from({ length: n }, (_, i) => i) },
        { type: 'watts', data: Array.from({ length: n }, (_, i) => (i < 500 ? 100 : i < 600 ? null : 300)) },
        { type: 'heartrate', data: Array.from({ length: n }, () => null) },
      ],
      100,
    );
    expect(s.step).toBe(10);
    expect(s.time).toHaveLength(100);
    expect(s.time[1]).toBe(10);
    expect(s.watts![0]).toBe(100);
    expect(s.watts![55]).toBeNull();
    expect(s.watts![99]).toBe(300);
    expect(s.heartrate).toBeNull();
  });

  it('une sortie sans streams donne des courbes vides', () => {
    expect(downsampleStreams([])).toEqual({ step: 1, time: [], watts: null, heartrate: null });
  });
});

describe('activityView', () => {
  it('place les intervalles de travail sur l’axe du temps et normalise les unités', () => {
    const streams = downsampleStreams([{ type: 'time', data: Array.from({ length: 800 }, (_, i) => i * 2) }], 400);
    const v = activityView(
      {
        id: 'i9',
        start_date_local: '2026-11-24T09:00:00',
        name: 'Seuil',
        icu_intensity: 90.4,
        icu_weighted_avg_watts: 221.4,
        total_elevation_gain: 520.6,
        icu_zone_times: [{ id: 'Z2', secs: 1200 }],
        icu_intervals: [
          { type: 'RECOVERY', start_index: 0, end_index: 100 },
          { type: 'WORK', start_index: 200, end_index: 500, moving_time: 600, average_watts: 251.6, average_heartrate: 162.2, zone: 4 },
        ],
      },
      streams,
    );
    expect(v.activity).toMatchObject({ intensity: 0.9, weightedWatts: 221, elevation: 521 });
    expect(v.intervals).toEqual([
      { label: 'Intervalle 1', start: 400, end: 1000, duration: 600, watts: 252, weightedWatts: null, heartrate: 162, cadence: null, zone: 4 },
    ]);
    expect(v.powerZones).toEqual([0, 1200, 0, 0, 0, 0, 0]);
    expect(v.hrZones).toBeNull();
  });
});
