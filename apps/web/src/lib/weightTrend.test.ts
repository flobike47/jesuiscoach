import { describe, expect, it } from 'vitest';
import { formatChange, formatKg, inRange, summarizeWeight, weightDomain } from './weightTrend';

const points = [
  { date: '2025-12-01', kg: 74.2 },
  { date: '2026-09-01', kg: 72.8 },
  { date: '2026-11-20', kg: 71.6 },
];

describe('weightTrend', () => {
  it('garde les pesées de la période', () => {
    expect(inRange(points, '90', '2026-11-27').map((p) => p.date)).toEqual(['2026-09-01', '2026-11-20']);
    expect(inRange(points, '365', '2026-11-27')).toHaveLength(3);
  });

  it("résume l'évolution depuis la première pesée de la période", () => {
    expect(summarizeWeight(points)).toEqual({ first: points[0], latest: points[2], change: -2.6 });
    expect(summarizeWeight([points[0]])?.change).toBeNull();
    expect(summarizeWeight([])).toBeNull();
  });

  it('garde au moins 4 kg d’amplitude à l’échelle', () => {
    const [lo, hi] = weightDomain([{ date: '2026-01-01', kg: 70 }, { date: '2026-01-02', kg: 70.3 }]);
    expect(hi - lo).toBeGreaterThanOrEqual(4);
    expect(lo).toBeLessThan(70);
    expect(hi).toBeGreaterThan(70.3);
  });

  it('formate en français', () => {
    expect(formatChange(-1.2)).toBe('−1,2 kg');
    expect(formatChange(0.4)).toBe('+0,4 kg');
    expect(formatChange(0)).toBe('stable');
    expect(formatChange(null)).toBe('');
    expect(formatKg(71)).toBe('71,0 kg');
  });
});
