import { describe, expect, it } from 'vitest';
import { workoutFromIntervals } from './fromActivity';
import { parseWorkout, workoutStats } from './workout';
import type { IntervalView } from '@/types';

const iv = (start: number, duration: number, watts: number): IntervalView => ({ label: '', start, end: start + duration, duration, watts, weightedWatts: watts, heartrate: null, cadence: null, zone: 4 });

describe('workoutFromIntervals', () => {
  it('reprend 3 blocs semblables en une répétition', () => {
    const text = workoutFromIntervals([iv(900, 720, 210), iv(1860, 720, 214), iv(2820, 715, 209)], 230)!;
    expect(text).toContain('3x\n- 12m 92%\n- 4m 55%');
    const steps = parseWorkout(text);
    expect(steps.filter((s) => s.from === 92)).toHaveLength(3);
    expect(workoutStats(steps).seconds).toBeGreaterThan(3000);
  });

  it('garde des efforts différents séparément', () => {
    const text = workoutFromIntervals([iv(600, 1200, 220), iv(2100, 240, 290)], 230)!;
    expect(text).toContain('- 20m 96%');
    expect(text).toContain('- 4m 126%');
    expect(text).not.toContain('2x');
  });

  it('ignore les efforts trop courts ou trop faciles', () => {
    expect(workoutFromIntervals([iv(0, 20, 400), iv(100, 600, 150)], 230)).toBeNull();
  });

  it('rien sans FTP', () => {
    expect(workoutFromIntervals([iv(900, 720, 210)], null)).toBeNull();
  });
});
