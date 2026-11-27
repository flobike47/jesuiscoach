import { describe, expect, it } from 'vitest';
import { formatChange, sampleAt, sharedMax, sparkPath, trendOf, valueDaysBefore } from './teamFitness';

const s = (values: number[]) => values.map((fitness, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, fitness }));

describe('teamFitness', () => {
  it("prend une échelle commune, arrondie à la dizaine, jamais une moyenne", () => {
    expect(sharedMax([{ id: 'a', name: 'A', series: s([20, 41]) }, { id: 'b', name: 'B', series: s([60, 55]) }])).toBe(60);
    expect(sharedMax([{ id: 'a', name: 'A', series: s([61.2]) }])).toBe(70);
    expect(sharedMax([])).toBe(10);
  });

  it("donne l'évolution sur la période", () => {
    expect(trendOf(s([40, 42, 44.6]))).toMatchObject({ change: 5, latest: { fitness: 44.6 } });
    expect(trendOf(s([40, 40.2]))?.change).toBe(0);
    expect(trendOf([])).toBeNull();
  });

  it('lit une valeur passée sans sortir de la série', () => {
    expect(valueDaysBefore(s([1, 2, 3, 4]), 2)).toBe(2);
    expect(valueDaysBefore(s([1, 2]), 30)).toBe(1);
    expect(valueDaysBefore([], 3)).toBeNull();
  });

  it('trace la courbe dans la boîte, 0 en bas et le maximum en haut', () => {
    expect(sparkPath(s([0, 50, 100]), 100, 40, 100)).toBe('M0.0,40.0 L50.0,20.0 L100.0,0.0');
    expect(sparkPath([], 100, 40, 100)).toBe('');
  });

  it("trouve le jour sous le doigt", () => {
    expect(sampleAt(s([1, 2, 3]), 0.9)?.index).toBe(2);
    expect(sampleAt(s([1, 2, 3]), -1)?.index).toBe(0);
    expect(sampleAt([], 0.5)).toBeNull();
  });

  it('formate le signe', () => {
    expect(formatChange(4)).toBe('+4');
    expect(formatChange(-3)).toBe('−3');
    expect(formatChange(0)).toBe('=');
  });
});
