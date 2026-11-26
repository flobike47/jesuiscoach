import { describe, expect, it } from 'vitest';
import { bestAverages, computeMetrics, criticalPowerModel, hrLoad, movingSecs, paceLoad, powerFromBests, powerZoneSecs, seriesFromStreams, toSeconds, weightedPower, type RawSeries, type Thresholds } from '../src/lib/metrics.js';
import type { BestRecord } from '../src/db/activityRepo.js';

/** Série à 1 Hz : `n` secondes à partir de 0, avec les valeurs données. */
function series(n: number, channels: Partial<Pick<RawSeries, 'watts' | 'heartrate' | 'velocity'>>, times?: number[]): RawSeries {
  return {
    time: times ?? Array.from({ length: n }, (_, i) => i),
    watts: channels.watts ?? null,
    heartrate: channels.heartrate ?? null,
    cadence: null,
    velocity: channels.velocity ?? null,
    distance: null,
    altitude: null,
  };
}

const NO_THRESHOLDS: Thresholds = { ftp: null, lthr: null, maxHr: null, restingHr: null, thresholdSpeed: null };
const constant = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('puissance pondérée', () => {
  it('vaut la puissance d’une série constante', () => {
    expect(weightedPower(toSeconds(series(120, { watts: constant(120, 200) })))).toBe(200);
  });

  it('sur deux paliers de 30 s : une seule fenêtre, donc la moyenne (100 et 300 W → 200 W)', () => {
    const watts = [...constant(15, 100), ...constant(15, 300)];
    expect(weightedPower(toSeconds(series(30, { watts })))).toBe(200);
  });

  it('demande au moins 30 s de données', () => {
    expect(weightedPower(toSeconds(series(20, { watts: constant(20, 300) })))).toBeNull();
  });
});

describe('charge (puissance)', () => {
  it('vaut 100 pour 1 h à la FTP', () => {
    const m = computeMetrics(series(3600, { watts: constant(3600, 250) }), { ...NO_THRESHOLDS, ftp: 250 }, 'Ride');
    expect(m).toMatchObject({ weightedWatts: 250, intensity: 1, load: 100, loadMethod: 'power' });
  });

  it('pour 60 s à 200 W avec une FTP de 250 W : 60 × 200 × 0,8 / (250 × 3600) × 100 = 1,1', () => {
    const m = computeMetrics(series(60, { watts: constant(60, 200) }), { ...NO_THRESHOLDS, ftp: 250 }, 'Ride');
    expect(m.intensity).toBe(0.8);
    expect(m.load).toBe(1.1);
  });

  it("n'utilise pas la puissance sans FTP et passe au cardio", () => {
    const m = computeMetrics(series(3600, { watts: constant(3600, 250), heartrate: constant(3600, 170) }), { ...NO_THRESHOLDS, lthr: 170, maxHr: 190 }, 'Ride');
    expect(m.loadMethod).toBe('hr');
    expect(m.intensity).toBeNull();
    expect(m.weightedWatts).toBe(250);
  });
});

describe('charge (cardio)', () => {
  it('vaut 100 pour 1 h à la FC seuil', () => {
    const secs = toSeconds(series(3600, { heartrate: constant(3600, 170) }));
    expect(hrLoad(secs, { ...NO_THRESHOLDS, lthr: 170, maxHr: 190, restingHr: 60 })).toBeCloseTo(100, 6);
  });

  it('sans FC seuil : pas de charge cardio', () => {
    expect(hrLoad(toSeconds(series(60, { heartrate: constant(60, 150) })), NO_THRESHOLDS)).toBeNull();
  });
});

describe('charge (allure)', () => {
  it('vaut 100 pour 1 h à la vitesse seuil', () => {
    const secs = toSeconds(series(3600, { velocity: constant(3600, 3) }));
    expect(paceLoad(secs, 3)).toBeCloseTo(100, 6);
    const m = computeMetrics(series(3600, { velocity: constant(3600, 3) }), { ...NO_THRESHOLDS, thresholdSpeed: 3 }, 'Run');
    expect(m).toMatchObject({ load: 100, loadMethod: 'pace' });
  });

  it('sans donnée utilisable : méthode « none », pas de charge', () => {
    const m = computeMetrics(series(60, {}), NO_THRESHOLDS, 'Run');
    expect(m).toMatchObject({ load: null, loadMethod: 'none' });
  });
});

describe('zones', () => {
  it('la somme des zones de puissance vaut la durée', () => {
    const z = powerZoneSecs(toSeconds(series(3600, { watts: constant(3600, 250) })), 250);
    expect(z).toEqual([0, 0, 0, 3600, 0, 0, 0]);
    expect(z.reduce((a, b) => a + b, 0)).toBe(3600);
  });

  it('répartit selon les bornes (Coggan) : 50 % et 160 % de la FTP', () => {
    const watts = [...constant(60, 125), ...constant(60, 400)];
    expect(powerZoneSecs(toSeconds(series(120, { watts })), 250)).toEqual([60, 0, 0, 0, 0, 0, 60]);
  });
});

describe('meilleures puissances', () => {
  it('un palier de 5 min à 300 W donne 300 W sur 300 s, et pas de durée plus longue', () => {
    const best = bestAverages(toSeconds(series(300, { watts: constant(300, 300) })));
    expect(best.find((b) => b.secs === 300)).toEqual({ secs: 300, watts: 300 });
    expect(best.at(-1)?.secs).toBe(300);
  });

  it('une pause de plus de 5 s compte pour 0 W et n’est pas une seconde de mouvement', () => {
    // 0-59 s à 200 W, pause de 10 s (60-69), puis 70-129 s à 200 W.
    const times = [...Array.from({ length: 60 }, (_, i) => i), ...Array.from({ length: 60 }, (_, i) => 70 + i)];
    const s = series(0, { watts: constant(120, 200) }, times);
    const secs = toSeconds(s);
    expect(secs).toHaveLength(130);
    expect(secs[65].live).toBe(false);
    expect(bestAverages(secs).find((b) => b.secs === 120)?.watts).toBe(183);
    expect(movingSecs(secs, s)).toBe(120);
  });

  it('un trou de 5 s au plus est comblé par la dernière valeur', () => {
    // 0-9 s, puis 15-24 s : 5 secondes sans mesure (10-14), comblées.
    const times = [...Array.from({ length: 10 }, (_, i) => i), ...Array.from({ length: 10 }, (_, i) => 15 + i)];
    const secs = toSeconds(series(0, { watts: constant(20, 200) }, times));
    expect(secs).toHaveLength(25);
    expect(secs.every((x) => x.live)).toBe(true);
  });
});

describe('conversion des streams Intervals.icu', () => {
  it('lit la vitesse lissée et ignore les instants sans temps', () => {
    const s = seriesFromStreams([
      { type: 'time', data: [0, null, 2] },
      { type: 'watts', data: [100, 999, 300] },
      { type: 'velocity_smooth', data: [4, 5, 6] },
    ]);
    expect(s.time).toEqual([0, 2]);
    expect(s.watts).toEqual([100, 300]);
    expect(s.velocity).toEqual([4, 6]);
    expect(s.heartrate).toBeNull();
  });
});

describe('modèle CP / W′', () => {
  it('retrouve CP ≈ 250 W et W′ ≈ 20 kJ quand le travail vaut 250 × t + 20 000', () => {
    // P(t) = 250 + 20000 / t, arrondi au watt (les points sont donc approchés).
    const points = [180, 300, 600, 900, 1200].map((secs) => ({ secs, watts: Math.round(250 + 20000 / secs) }));
    const m = criticalPowerModel(points)!;
    expect(Math.abs(m.cp! - 250)).toBeLessThanOrEqual(3);
    expect(Math.abs(m.wPrime! - 20000)).toBeLessThanOrEqual(1000);
    // FTP estimée : 95 % de la meilleure 20 min (267 W) = 253,65 → 254.
    expect(m.ftp).toBe(254);
  });

  it('sans meilleure 20 min ni assez de points : pas de modèle', () => {
    expect(criticalPowerModel([{ secs: 60, watts: 400 }])).toBeNull();
  });
});

describe('courbe de puissance depuis la base', () => {
  const best = (secs: number, watts: number, startLocal: string, name = 'Sortie'): BestRecord => ({ activityId: `a${secs}-${startLocal}`, name, startLocal, secs, watts });

  it('un record de l’année compte comme « record de l’année » seulement s’il bat l’an passé', () => {
    const view = powerFromBests({
      bests: {
        '90d': [best(1200, 280, '2026-10-01T09:00:00', 'Seuil')],
        '1y': [best(1200, 280, '2026-10-01T09:00:00', 'Seuil'), best(1200, 300, '2026-02-01T09:00:00', 'Vieille sortie')],
      },
      ftp: 250,
      weightKg: 70,
    });
    const r = view.records['90d'].find((x) => x.secs === 1200)!;
    expect(r).toMatchObject({ watts: 280, wkg: 4, activityName: 'Seuil', date: '2026-10-01', yearBest: false });
    expect(view.curves['90d']).toEqual([{ secs: 1200, watts: 280 }]);
    expect(view.ftp).toBe(250);
  });

  it('sans meilleure puissance : listes vides et pas de modèle', () => {
    const view = powerFromBests({ bests: { '90d': [], '1y': [] }, ftp: null, weightKg: null });
    expect(view.curves['1y']).toEqual([]);
    expect(view.models['1y']).toBeNull();
  });
});
