import { describe, expect, it } from 'vitest';
import { formatHours, sharesLabel, sportShares, totalSecs } from './sportShare';

describe('sportShare', () => {
  it('donne des parts entières qui totalisent 100 %, dans un ordre fixe', () => {
    const shares = sportShares({ Ride: 1000, Run: 1000, Swim: 1000, Other: 0 });
    expect(shares.map((s) => s.key)).toEqual(['Ride', 'Swim', 'Run']);
    expect(shares.reduce((s, x) => s + x.percent, 0)).toBe(100);
    expect(shares.map((s) => s.percent).sort()).toEqual([33, 33, 34]);
  });

  it('omet les sports non pratiqués et gère l’absence de sortie', () => {
    expect(sportShares({ Ride: 3600, Run: 0, Swim: 0, Other: 0 })).toEqual([{ key: 'Ride', label: 'Vélo', color: 'var(--blue)', secs: 3600, percent: 100 }]);
    expect(sportShares({ Ride: 0, Run: 0, Swim: 0, Other: 0 })).toEqual([]);
    expect(totalSecs({ Ride: 10, Run: 20, Swim: 0, Other: 5 })).toBe(35);
  });

  it('formate les durées en heures et minutes', () => {
    expect(formatHours(45 * 60)).toBe('45 min');
    expect(formatHours(3 * 3600)).toBe('3 h');
    expect(formatHours(3 * 3600 + 5 * 60)).toBe('3 h 05');
    expect(formatHours(0)).toBe('0 min');
  });

  it('décrit la répartition en texte', () => {
    expect(sharesLabel(sportShares({ Ride: 8, Run: 2, Swim: 0, Other: 0 }))).toBe('Vélo 80 %, Course 20 %');
    expect(sharesLabel([])).toBe('Aucune sortie');
  });
});
