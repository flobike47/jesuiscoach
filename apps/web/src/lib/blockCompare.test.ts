import { describe, expect, it } from 'vitest';
import { compareBlocks } from './blockCompare';
import { parseWorkout } from './workout';
import type { IntervalView } from '@/types';

const iv = (start: number, duration: number, watts: number): IntervalView => ({ label: '', start, end: start + duration, duration, watts, weightedWatts: watts, heartrate: null, cadence: null, zone: 4 });
const sst = parseWorkout('- 15m ramp 50-75%\n\n3x\n- 12m 88-93%\n- 4m 55%\n\n- 10m 50%');

describe('compareBlocks', () => {
  it('apparie chaque bloc de travail à un intervalle de durée voisine', () => {
    const r = compareBlocks(sst, 230, [iv(900, 720, 211), iv(1860, 715, 219), iv(2820, 725, 209)]);
    expect(r?.blocks.map((b) => b.actual)).toEqual([211, 219, 209]);
    expect(r?.blocks[0].target).toEqual([202, 214]);
    expect(r?.summary).toBe('2 blocs sur 3 dans la cible (202–214 W) ; parti trop fort sur 1.');
  });

  it('tous dans la cible', () => {
    const r = compareBlocks(sst, 230, [iv(900, 720, 205), iv(1860, 720, 210), iv(2820, 720, 208)]);
    expect(r?.summary).toBe('Les 3 blocs sont dans la cible (202–214 W).');
  });

  it('ignore les intervalles trop courts ou trop longs', () => {
    const r = compareBlocks(sst, 230, [iv(100, 60, 400), iv(900, 720, 210)]);
    expect(r?.blocks).toHaveLength(1);
    expect(r?.blocks[0].actual).toBe(210);
  });

  it('cible ponctuelle : ±3 %', () => {
    const r = compareBlocks(parseWorkout('2x\n- 20m 95%\n- 5m 55%'), 200, [iv(0, 1200, 190), iv(1500, 1200, 200)]);
    expect(r?.blocks[0].target).toEqual([184, 196]);
    expect(r?.blocks.map((b) => b.ok)).toEqual([true, false]);
  });

  it('rien à comparer sans FTP, sans bloc en puissance ou sans intervalle', () => {
    expect(compareBlocks(sst, null, [iv(900, 720, 210)])).toBeNull();
    expect(compareBlocks(parseWorkout('- 60m 70%'), 230, [iv(0, 3600, 160)])).toBeNull();
    expect(compareBlocks(sst, 230, [])).toBeNull();
  });
});
