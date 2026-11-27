import { describe, expect, it } from 'vitest';
import { addSportCounts, countBySport } from '../src/lib/sportCount.js';

describe('countBySport', () => {
  it('compte chaque sortie dans vélo, course, natation ou autre, quelle que soit sa durée', () => {
    expect(
      countBySport(
        [
          { start_date_local: '2026-11-10T08:00:00', type: 'Ride' },
          { start_date_local: '2026-11-11T08:00:00', type: 'VirtualRide' },
          { start_date_local: '2026-11-12T08:00:00', type: 'TrailRun' },
          { start_date_local: '2026-11-13T08:00:00', type: 'OpenWaterSwim' },
          { start_date_local: '2026-11-14T08:00:00', type: 'WeightTraining' },
          { start_date_local: '2026-11-15T08:00:00' },
        ],
        '2026-11-01',
      ),
    ).toEqual({ Ride: 2, Run: 1, Swim: 1, Other: 2 });
  });

  it('ignore les sorties avant la période ou sans date', () => {
    expect(
      countBySport(
        [
          { start_date_local: '2026-10-31T23:00:00', type: 'Ride' },
          { start_date_local: '2026-11-01T06:00:00', type: 'Ride' },
          { type: 'Run' } as { type: string; start_date_local: string },
        ],
        '2026-11-01',
      ),
    ).toEqual({ Ride: 1, Run: 0, Swim: 0, Other: 0 });
  });

  it("additionne les sorties de l'équipe", () => {
    expect(addSportCounts([{ Ride: 1, Run: 2, Swim: 3, Other: 4 }, { Ride: 10, Run: 0, Swim: 0, Other: 1 }])).toEqual({ Ride: 11, Run: 2, Swim: 3, Other: 5 });
    expect(addSportCounts([])).toEqual({ Ride: 0, Run: 0, Swim: 0, Other: 0 });
  });
});
