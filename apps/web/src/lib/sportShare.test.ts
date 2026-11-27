import { describe, expect, it } from 'vitest';
import { formatCount, sharesLabel, sportShares, totalCount } from './sportShare';

describe('sportShare', () => {
  it('donne des parts entières qui totalisent 100 %, dans un ordre fixe', () => {
    const shares = sportShares({ Ride: 1, Run: 1, Swim: 1, Other: 0 });
    expect(shares.map((s) => s.key)).toEqual(['Ride', 'Swim', 'Run']);
    expect(shares.reduce((s, x) => s + x.percent, 0)).toBe(100);
    expect(shares.map((s) => s.percent).sort()).toEqual([33, 33, 34]);
  });

  it('omet les sports non pratiqués et gère l’absence de sortie', () => {
    expect(sportShares({ Ride: 12, Run: 0, Swim: 0, Other: 0 })).toEqual([{ key: 'Ride', label: 'Vélo', color: 'var(--blue)', count: 12, percent: 100 }]);
    expect(sportShares({ Ride: 0, Run: 0, Swim: 0, Other: 0 })).toEqual([]);
    expect(totalCount({ Ride: 10, Run: 2, Swim: 0, Other: 1 })).toBe(13);
  });

  it('écrit le nombre de sorties, au singulier ou au pluriel', () => {
    expect(formatCount(0)).toBe('0 sortie');
    expect(formatCount(1)).toBe('1 sortie');
    expect(formatCount(12)).toBe('12 sorties');
  });

  it('décrit la répartition en texte', () => {
    expect(sharesLabel(sportShares({ Ride: 8, Run: 2, Swim: 0, Other: 0 }))).toBe('Vélo 80 %, Course 20 %');
    expect(sharesLabel([])).toBe('Aucune sortie');
  });
});
