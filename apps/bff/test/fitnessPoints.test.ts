import { describe, expect, it } from 'vitest';
import { fitnessPoints } from '../src/lib/fitness.js';

describe('fitnessPoints', () => {
  it("prend le calcul de l'app quand il existe, arrondi au dixième", () => {
    const days = [{ date: '2026-11-01', load: 50, fitness: 41.26, fatigue: 50.04, form: -8.81, ramp: null }];
    expect(fitnessPoints(days, [{ id: '2026-11-01', ctl: 99, atl: 99 }])).toEqual([{ date: '2026-11-01', fitness: 41.3, fatigue: 50, form: -8.8 }]);
  });

  it("sinon celui d'Intervals.icu, sans les jours vides", () => {
    expect(
      fitnessPoints(null, [
        { id: '2026-11-01', ctl: 40, atl: 45.34 },
        { id: '2026-11-02', ctl: null },
      ]),
    ).toEqual([{ date: '2026-11-01', fitness: 40, fatigue: 45.34, form: -5.3 }]);
  });
});
