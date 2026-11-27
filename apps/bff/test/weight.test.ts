import { describe, expect, it } from 'vitest';
import { weightSeries } from '../src/lib/weight.js';

describe('weightSeries', () => {
  it('trie les pesées, arrondit et écarte les jours sans poids', () => {
    expect(
      weightSeries([
        { id: '2026-03-02', weight: 70.04 },
        { id: '2026-03-01', weight: 70.56 },
        { id: '2026-03-03', ctl: 40 },
        { id: '2026-03-04', weight: null },
      ]),
    ).toEqual([
      { date: '2026-03-01', kg: 70.6 },
      { date: '2026-03-02', kg: 70 },
    ]);
  });

  it('écarte les valeurs hors des bornes de saisie et les dates invalides', () => {
    expect(
      weightSeries([
        { id: '2026-03-01', weight: 12 },
        { id: '2026-03-02', weight: 250 },
        { id: '2026-03-03', weight: Number.NaN },
        { id: 'hier', weight: 70 },
      ]),
    ).toEqual([]);
  });

  it('garde une seule pesée par jour', () => {
    expect(weightSeries([{ id: '2026-03-01', weight: 70 }, { id: '2026-03-01T00:00:00', weight: 71 }])).toEqual([{ date: '2026-03-01', kg: 71 }]);
  });
});
