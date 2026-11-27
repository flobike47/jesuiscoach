import { describe, expect, it } from 'vitest';
import { addSportTimes, timeBySport } from '../src/lib/sportTime.js';

describe('timeBySport', () => {
  it('range chaque sortie dans vélo, course, natation ou autre', () => {
    expect(
      timeBySport(
        [
          { start_date_local: '2026-11-10T08:00:00', type: 'Ride', moving_time: 3600 },
          { start_date_local: '2026-11-11T08:00:00', type: 'VirtualRide', moving_time: 1800 },
          { start_date_local: '2026-11-12T08:00:00', type: 'TrailRun', moving_time: 2700 },
          { start_date_local: '2026-11-13T08:00:00', type: 'OpenWaterSwim', moving_time: 1200 },
          { start_date_local: '2026-11-14T08:00:00', type: 'WeightTraining', moving_time: 900 },
          { start_date_local: '2026-11-15T08:00:00', moving_time: 600 },
        ],
        '2026-11-01',
      ),
    ).toEqual({ Ride: 5400, Run: 2700, Swim: 1200, Other: 1500 });
  });

  it('ignore les sorties avant la période et les durées absentes ou invalides', () => {
    expect(
      timeBySport(
        [
          { start_date_local: '2026-10-31T23:00:00', type: 'Ride', moving_time: 3600 },
          { start_date_local: '2026-11-01T06:00:00', type: 'Ride', moving_time: 600 },
          { start_date_local: '2026-11-02T06:00:00', type: 'Run', moving_time: null },
          { start_date_local: '2026-11-02T07:00:00', type: 'Run', moving_time: -5 },
        ],
        '2026-11-01',
      ),
    ).toEqual({ Ride: 600, Run: 0, Swim: 0, Other: 0 });
  });

  it("additionne les temps de l'équipe", () => {
    expect(addSportTimes([{ Ride: 1, Run: 2, Swim: 3, Other: 4 }, { Ride: 10, Run: 0, Swim: 0, Other: 1 }])).toEqual({ Ride: 11, Run: 2, Swim: 3, Other: 5 });
    expect(addSportTimes([])).toEqual({ Ride: 0, Run: 0, Swim: 0, Other: 0 });
  });
});
