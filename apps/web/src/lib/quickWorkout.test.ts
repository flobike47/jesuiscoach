import { describe, it, expect } from 'vitest';
import { parseQuick, variantOf } from './quickWorkout';
import { parseWorkout, workoutStats } from './workout';

describe('parseQuick', () => {
  describe('Duration parsing', () => {
    it('parses 15 minutes (apostrophe)', () => {
      const result = parseQuick("15' endu");
      expect(result.text).toContain('15m');
      expect(result.tokens).toHaveLength(1);
      expect(result.unknown).toHaveLength(0);
    });

    it('parses 15 minutes (min)', () => {
      const result = parseQuick('15 min endu');
      expect(result.text).toContain('15m');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses 15 minutes (m)', () => {
      const result = parseQuick('15m endu');
      expect(result.text).toContain('15m');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses 1h30', () => {
      const result = parseQuick('1h30 endu');
      expect(result.text).toContain('1h30m');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses 1 h 30 (spaces)', () => {
      const result = parseQuick('1 h 30 endu');
      expect(result.text).toContain('1h30m');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses 90 minutes', () => {
      const result = parseQuick('90 min endu');
      // 90 minutes = 1h 30m, which formats as "1h30m"
      expect(result.text).toContain('1h30m');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses 30 seconds', () => {
      const result = parseQuick('30s sprint');
      expect(result.text).toContain('30s');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses 30 seconds (s)', () => {
      const result = parseQuick('30 s sprint');
      expect(result.text).toContain('30s');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses 15 seconds (double apostrophe)', () => {
      const result = parseQuick("15'' sprint");
      expect(result.text).toContain('15s');
      expect(result.unknown).toHaveLength(0);
    });
  });

  describe('Intensity parsing', () => {
    it('parses percentage intensity: 95%', () => {
      const result = parseQuick('20m à 95%');
      expect(result.text).toContain('95%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses percentage intensity: @95%', () => {
      const result = parseQuick('20m @95%');
      expect(result.text).toContain('95%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses range intensity: 88-93%', () => {
      const result = parseQuick('12m 88-93%');
      expect(result.text).toContain('88-93%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: endu', () => {
      const result = parseQuick('1h endu');
      expect(result.text).toContain('65-75%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: endurance', () => {
      const result = parseQuick('1h endurance');
      expect(result.text).toContain('65-75%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: Z2', () => {
      const result = parseQuick('1h Z2');
      expect(result.text).toContain('65-75%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: tempo', () => {
      const result = parseQuick('20m tempo');
      expect(result.text).toContain('76-87%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: SS (sweet spot)', () => {
      const result = parseQuick('12m SS');
      expect(result.text).toContain('88-93%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: seuil', () => {
      const result = parseQuick('10m seuil');
      expect(result.text).toContain('95-100%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: FTP', () => {
      const result = parseQuick('10m FTP');
      expect(result.text).toContain('95-100%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: VO2max', () => {
      const result = parseQuick('4m VO2max');
      expect(result.text).toContain('110-120%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: sprint', () => {
      const result = parseQuick('15s sprint');
      expect(result.text).toContain('150%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: récup', () => {
      const result = parseQuick('5m récup');
      expect(result.text).toContain('50-55%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses zone keyword: calme', () => {
      const result = parseQuick('10m calme');
      expect(result.text).toContain('50%');
      expect(result.unknown).toHaveLength(0);
    });
  });

  describe('Section types', () => {
    it('parses warmup: échauf', () => {
      const result = parseQuick('15 min échauf');
      expect(result.text).toContain('Échauffement');
      expect(result.text).toContain('ramp 50-75%');
      expect(result.tokens[0].kind).toBe('warmup');
    });

    it('parses warmup: échauffement', () => {
      const result = parseQuick('15 min échauffement');
      expect(result.text).toContain('Échauffement');
      expect(result.text).toContain('ramp 50-75%');
      expect(result.tokens[0].kind).toBe('warmup');
    });

    it('parses warmup: EC', () => {
      const result = parseQuick('15 min EC');
      expect(result.text).toContain('Échauffement');
      expect(result.text).toContain('ramp 50-75%');
    });

    it('parses cooldown: calme', () => {
      const result = parseQuick('10 min calme');
      expect(result.text).toContain('Retour au calme');
      expect(result.text).toContain('50%');
      expect(result.tokens[0].kind).toBe('cooldown');
    });

    it('parses cooldown: RAC', () => {
      const result = parseQuick('10 min RAC');
      expect(result.text).toContain('Retour au calme');
      expect(result.text).toContain('50%');
    });

    it('parses cooldown: retour au calme', () => {
      const result = parseQuick('10 min retour au calme');
      expect(result.text).toContain('Retour au calme');
      expect(result.text).toContain('50%');
    });
  });

  describe('Repeats and recovery', () => {
    it('parses repeats: 2x', () => {
      const result = parseQuick('2x20 à 95%');
      expect(result.text).toContain('2x');
      expect(result.text).toContain('20m 95%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses repeats: 2 x', () => {
      const result = parseQuick('2 x 20m 95%');
      expect(result.text).toContain('2x');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses repeats: 2×', () => {
      const result = parseQuick('2×20 95%');
      expect(result.text).toContain('2x');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses recovery: r5', () => {
      const result = parseQuick('3x12 SS r5');
      expect(result.text).toContain('3x');
      expect(result.text).toContain('5m 55%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses recovery: r 5m', () => {
      const result = parseQuick('3x12 SS r 5m');
      expect(result.text).toContain('5m 55%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses recovery: r 5\'', () => {
      const result = parseQuick("3x12 SS r 5'");
      expect(result.text).toContain('5m 55%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses recovery: r30s', () => {
      const result = parseQuick('8x15s sprint r30s');
      expect(result.text).toContain('30s 55%');
      expect(result.unknown).toHaveLength(0);
    });

    it('parses recovery: récup 4', () => {
      const result = parseQuick('5x4 VO2 récup 4');
      expect(result.text).toContain('4m 55%');
      expect(result.unknown).toHaveLength(0);
    });
  });

  describe('Complex examples', () => {
    it('parses: 15\' échauf, 2x20 à 95% r5, 10\' calme', () => {
      const result = parseQuick("15' échauf, 2x20 à 95% r5, 10' calme");
      expect(result.text).toContain('Échauffement');
      expect(result.text).toContain('15m ramp 50-75%');
      expect(result.text).toContain('2x');
      expect(result.text).toContain('20m 95%');
      expect(result.text).toContain('5m 55%');
      expect(result.text).toContain('Retour au calme');
      expect(result.text).toContain('10m 50%');
      expect(result.tokens).toHaveLength(4);
      expect(result.unknown).toHaveLength(0);
      expect(result.name).toBe('Seuil 2×20');
    });

    it('parses: 3x12 SS r4', () => {
      const result = parseQuick('3x12 SS r4');
      expect(result.text).toContain('3x');
      expect(result.text).toContain('12m 88-93%');
      expect(result.text).toContain('4m 55%');
      expect(result.unknown).toHaveLength(0);
      expect(result.name).toBe('Sweet spot 3×12');
    });

    it('parses: 8x15s sprint r2\'', () => {
      const result = parseQuick("8x15s sprint r2'");
      expect(result.text).toContain('8x');
      expect(result.text).toContain('15s 150%');
      expect(result.text).toContain('2m 55%');
      expect(result.unknown).toHaveLength(0);
      expect(result.name).toBe('Sprints 8×15 s');
    });

    it('parses: 1h30 endu', () => {
      const result = parseQuick('1h30 endu');
      expect(result.text).toContain('1h30m 65-75%');
      expect(result.tokens).toHaveLength(1);
      expect(result.unknown).toHaveLength(0);
      expect(result.name).toBe('Endurance 1 h 30');
    });

    it('parses: 5x4 VO2max', () => {
      const result = parseQuick('5x4 VO2max');
      expect(result.text).toContain('5x');
      expect(result.text).toContain('4m 110-120%');
      expect(result.unknown).toHaveLength(0);
      expect(result.name).toBe('VO2max 5×4');
    });
  });

  describe('Roundtrip with parseWorkout', () => {
    it('roundtrips: 15\' échauf, 2x20 à 95% r5, 10\' calme', () => {
      const quick = parseQuick("15' échauf, 2x20 à 95% r5, 10' calme");
      const steps = parseWorkout(quick.text);
      const stats = workoutStats(steps);

      // Should have 6 steps: 15m@50-75%, 2x(20m@95%, 5m@55%), 10m@50%
      // Warmup, interval x2, recovery x2, cooldown
      expect(steps).toHaveLength(6);
      expect(stats.seconds).toBeGreaterThan(0);
      expect(stats.load).toBeGreaterThan(0);
      expect(stats.intensity).toBeGreaterThan(0);
      expect(stats.complete).toBe(true);
    });

    it('roundtrips: 3x12 SS r4', () => {
      const quick = parseQuick('3x12 SS r4');
      const steps = parseWorkout(quick.text);

      // Should have 6 steps: 3x(12m@88-93%, 4m@55%)
      expect(steps).toHaveLength(6);
      expect(steps[0].seconds).toBe(12 * 60);
      expect(steps[0].from).toBeCloseTo(90.5); // Middle of 88-93
    });

    it('roundtrips: 8x15s sprint r30s', () => {
      const quick = parseQuick('8x15s sprint r30s');
      const steps = parseWorkout(quick.text);

      // Should have 16 steps: 8x(15s@150%, 30s@55%)
      expect(steps).toHaveLength(16);
      expect(steps[0].seconds).toBe(15);
      expect(steps[1].seconds).toBe(30);
    });

    it('roundtrips: 1h30 endu', () => {
      const quick = parseQuick('1h30 endu');
      const steps = parseWorkout(quick.text);

      expect(steps).toHaveLength(1);
      expect(steps[0].seconds).toBe(90 * 60);
    });
  });

  describe('Unknown items', () => {
    it('marks unknown segments', () => {
      const result = parseQuick("15' échauf, xyz, 10' calme");
      expect(result.unknown).toContain('xyz');
      expect(result.tokens).toHaveLength(2);
    });

    it('handles segment without duration', () => {
      const result = parseQuick('95% seuil');
      expect(result.unknown).toContain('95% seuil');
    });

    it('handles mixed known and unknown', () => {
      const result = parseQuick("15m endu; foobar; 10m calme");
      expect(result.unknown.length).toBeGreaterThan(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe('Tokens', () => {
    it('generates warmup token', () => {
      const result = parseQuick('15m échauf');
      expect(result.tokens[0]).toEqual({
        kind: 'warmup',
        label: 'Échauffement 15 min',
      });
    });

    it('generates interval token with recovery', () => {
      const result = parseQuick('3x12 SS r4');
      expect(result.tokens[0]).toEqual({
        kind: 'interval',
        label: '3× 12 min · 88%',
      });
      expect(result.tokens[1]).toEqual({
        kind: 'recovery',
        label: 'récup 4 min',
      });
    });

    it('generates steady token', () => {
      const result = parseQuick('1h30 endu');
      expect(result.tokens[0]).toEqual({
        kind: 'steady',
        label: '1 h 30 · 65%',
      });
    });

    it('generates cooldown token', () => {
      const result = parseQuick('10m calme');
      expect(result.tokens[0]).toEqual({
        kind: 'cooldown',
        label: 'Calme 10 min',
      });
    });
  });

  describe('Names', () => {
    it('generates name: Seuil 2×20', () => {
      const result = parseQuick('2x20 seuil');
      expect(result.name).toBe('Seuil 2×20');
    });

    it('generates name: Sweet spot 3×12', () => {
      const result = parseQuick('3x12 SS');
      expect(result.name).toBe('Sweet spot 3×12');
    });

    it('generates name: VO2max 5×4', () => {
      const result = parseQuick('5x4 VO2max');
      expect(result.name).toBe('VO2max 5×4');
    });

    it('generates name: Sprints 8×15 s', () => {
      const result = parseQuick('8x15s sprint');
      expect(result.name).toBe('Sprints 8×15 s');
    });

    it('generates name: Endurance 1 h 30', () => {
      const result = parseQuick('1h30 endu');
      expect(result.name).toBe('Endurance 1 h 30');
    });

    it('generates name: Tempo 45 min', () => {
      const result = parseQuick('45m tempo');
      expect(result.name).toBe('Tempo 45 min');
    });

    it('generates name without repeats: Endurance', () => {
      const result = parseQuick('60m endu');
      expect(result.name).toContain('Endurance');
    });
  });

  describe('Separators', () => {
    it('handles comma separator', () => {
      const result = parseQuick('15m échauf, 20m 95%, 10m calme');
      expect(result.tokens).toHaveLength(3);
    });

    it('handles semicolon separator', () => {
      const result = parseQuick('15m échauf; 20m 95%; 10m calme');
      expect(result.tokens).toHaveLength(3);
    });

    it('handles "puis" separator', () => {
      const result = parseQuick('15m échauf puis 20m 95% puis 10m calme');
      expect(result.tokens).toHaveLength(3);
    });

    it('handles + separator', () => {
      const result = parseQuick('15m échauf + 20m 95% + 10m calme');
      expect(result.tokens).toHaveLength(3);
    });
  });

  describe('Case insensitivity and accents', () => {
    it('handles uppercase keywords', () => {
      const result = parseQuick('15 MIN ECHAUF');
      expect(result.text).toContain('Échauffement');
      expect(result.unknown).toHaveLength(0);
    });

    it('handles mixed case', () => {
      const result = parseQuick('15m EcHaUf');
      expect(result.text).toContain('Échauffement');
      expect(result.unknown).toHaveLength(0);
    });

    it('handles accent variations', () => {
      const result = parseQuick('15m echauf');
      expect(result.text).toContain('Échauffement');
    });
  });
});

describe('variantOf', () => {
  describe('standard variant', () => {
    it('returns unchanged text for standard variant', () => {
      const quick = parseQuick('3x12 SS r4');
      const variant = variantOf(quick.text, 'standard');
      expect(variant).toBe(quick.text);
    });
  });

  describe('courte variant', () => {
    it('reduces repeats by 1 (min 1)', () => {
      const quick = parseQuick('3x12 SS r4');
      const variant = variantOf(quick.text, 'courte');
      const steps = parseWorkout(variant);
      // Should have 4 steps instead of 6: 2x(12m@88-93%, 4m@55%)
      expect(steps).toHaveLength(4);
    });

    it('reduces single repeat by 25%', () => {
      const quick = parseQuick('1x20 SS');
      const variant = variantOf(quick.text, 'courte');
      const steps = parseWorkout(variant);
      // Should have 1 step of ~15m (20m * 0.75)
      expect(steps).toHaveLength(1);
      expect(steps[0].seconds).toBeCloseTo(15 * 60, -1);
    });

    it('reduces non-repeat block by 25%', () => {
      const quick = parseQuick('40m endu');
      const variant = variantOf(quick.text, 'courte');
      const steps = parseWorkout(variant);
      expect(steps).toHaveLength(1);
      expect(steps[0].seconds).toBeCloseTo(30 * 60, -1); // 40 * 0.75 = 30
    });
  });

  describe('longue variant', () => {
    it('increases repeats by 1', () => {
      const quick = parseQuick('3x12 SS r4');
      const variant = variantOf(quick.text, 'longue');
      const steps = parseWorkout(variant);
      // Should have 8 steps instead of 6: 4x(12m@88-93%, 4m@55%)
      expect(steps).toHaveLength(8);
    });

    it('increases non-repeat block by 25%', () => {
      const quick = parseQuick('40m endu');
      const variant = variantOf(quick.text, 'longue');
      const steps = parseWorkout(variant);
      expect(steps).toHaveLength(1);
      expect(steps[0].seconds).toBeCloseTo(50 * 60, -1); // 40 * 1.25 = 50
    });
  });

  describe('roundtrip variants', () => {
    it('roundtrips courte variant with repeats', () => {
      const quick = parseQuick("15' échauf, 3x12 SS r4, 10' calme");
      const courte = variantOf(quick.text, 'courte');
      const steps = parseWorkout(courte);
      expect(steps.length).toBeGreaterThan(0);
      expect(workoutStats(steps).complete).toBe(true);
    });

    it('roundtrips longue variant with repeats', () => {
      const quick = parseQuick("15' échauf, 3x12 SS r4, 10' calme");
      const longue = variantOf(quick.text, 'longue');
      const steps = parseWorkout(longue);
      expect(steps.length).toBeGreaterThan(0);
      expect(workoutStats(steps).complete).toBe(true);
    });

    it('roundtrips courte variant without repeats', () => {
      const quick = parseQuick('1h30 endu');
      const courte = variantOf(quick.text, 'courte');
      const steps = parseWorkout(courte);
      expect(steps).toHaveLength(1);
    });

    it('roundtrips longue variant without repeats', () => {
      const quick = parseQuick('1h30 endu');
      const longue = variantOf(quick.text, 'longue');
      const steps = parseWorkout(longue);
      expect(steps).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('courte variant on 2 repeats reduces to 1', () => {
      const quick = parseQuick('2x20 seuil r5');
      const courte = variantOf(quick.text, 'courte');
      expect(courte).toContain('1x');
    });

    it('courte variant on 1 repeat stays at 1', () => {
      const quick = parseQuick('1x30 SS');
      const courte = variantOf(quick.text, 'courte');
      expect(courte).toContain('1x');
    });
  });
});
