import { describe, expect, it } from 'vitest';
import { fitnessSeries } from '../src/lib/fitness.js';

describe('fitness et fatigue', () => {
  it('le premier jour reprend la valeur de départ (wellness du jour)', () => {
    const s = fitnessSeries(new Map(), '2026-01-01', '2026-01-03', { ctl: 50, atl: 60 });
    expect(s[0]).toMatchObject({ date: '2026-01-01', fitness: 50, fatigue: 60 });
  });

  it('un jour de charge 150 après un départ à 50 : fitness = 50 + 100 × (1 − e^(−1/42)) ≈ 52,35', () => {
    const s = fitnessSeries(new Map([['2026-01-02', 150]]), '2026-01-01', '2026-01-02', { ctl: 50, atl: 60 });
    expect(s[1].fitness).toBeCloseTo(52.35, 2);
    // Fatigue : 60 + (150 − 60) × (1 − e^(−1/7)) ≈ 71,98
    expect(s[1].fatigue).toBeCloseTo(71.98, 2);
  });

  it('la forme du matin vient de la veille : 50 − 60 = −10 le jour suivant sans charge', () => {
    const s = fitnessSeries(new Map(), '2026-01-01', '2026-01-02', { ctl: 50, atl: 60 });
    expect(s[1].form).toBe(-10);
  });

  it('une charge constante fait converger la fitness vers la charge', () => {
    const loads = new Map<string, number>();
    for (let i = 1; i <= 365; i++) loads.set(new Date(Date.parse('2026-01-01T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10), 100);
    const s = fitnessSeries(loads, '2026-01-01', '2027-01-01');
    expect(s.at(-1)!.fitness).toBeGreaterThan(99.9);
    expect(s.at(-1)!.fatigue).toBeCloseTo(100, 6);
  });

  it('la rampe n’existe pas pour les 7 premiers jours, puis compare à J−7', () => {
    const s = fitnessSeries(new Map(), '2026-01-01', '2026-01-10', { ctl: 40, atl: 40 });
    expect(s[6].ramp).toBeNull();
    expect(s[7].ramp).toBeCloseTo(s[7].fitness - s[0].fitness, 10);
    expect(s[7].ramp).toBeLessThan(0);
  });
});
