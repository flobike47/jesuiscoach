import { describe, expect, it } from 'vitest';
import { parseDistance, parseDuration, parseStep, parseWorkout, TEMPLATES, workoutStats, zoneColor } from './workout';

describe('parseDuration', () => {
  it.each([
    ['10m', 600],
    ['1h', 3600],
    ['30s', 30],
    ['3m45s', 225],
    ['1h30m', 5400],
  ])('%s → %i s', (token, s) => expect(parseDuration(token)).toBe(s));

  it.each(['', 'm', '10', 'dix'])('rejette %j', (token) => expect(parseDuration(token)).toBeNull());
});

describe('parseStep', () => {
  it('lit un palier, une plage et une rampe', () => {
    expect(parseStep('- 10m 95%')).toEqual({ seconds: 600, meters: 0, from: 95, to: 95, target: 'power' });
    expect(parseStep('- 12m 88-93%')).toEqual({ seconds: 720, meters: 0, from: 90.5, to: 90.5, target: 'power' });
    expect(parseStep('- 15m ramp 50-75%')).toEqual({ seconds: 900, meters: 0, from: 50, to: 75, target: 'power' });
  });

  it('lit les cibles cardio, allure et la cadence', () => {
    expect(parseStep('- 20m 80-85% LTHR')).toMatchObject({ seconds: 1200, from: 82.5, target: 'hr' });
    expect(parseStep('- 20m 70% HR')).toMatchObject({ target: 'hrmax' });
    expect(parseStep('- 8m 97-100% Pace')).toMatchObject({ seconds: 480, target: 'pace' });
    expect(parseStep('- 5m 85-90% 55-65rpm')).toMatchObject({ seconds: 300, from: 87.5, target: 'power' });
  });

  it('lit les paliers en distance (« m » = minutes, « mtr » = mètres)', () => {
    expect(parseStep('- 400mtr 105% Pace')).toEqual({ seconds: 0, meters: 400, from: 105, to: 105, target: 'pace' });
    expect(parseStep('- 1.5km 85% LTHR')).toMatchObject({ meters: 1500, seconds: 0 });
    expect(parseStep('- 10m 70%')).toMatchObject({ seconds: 600, meters: 0 });
    expect(parseDistance('1mi')).toBe(1609);
    expect(parseDistance('100y')).toBe(91);
    expect(parseDistance('10m')).toBeNull();
  });

  it('ignore titres et lignes incomplètes', () => {
    expect(parseStep('Échauffement')).toBeNull();
    expect(parseStep('- 10m')).toBeNull();
  });
});

describe('parseWorkout', () => {
  it('développe les répétitions jusqu’à la ligne vide', () => {
    const steps = parseWorkout('Échauffement\n- 10m 50%\n\n3x\n- 10m 95%\n- 5m 55%\n\n- 10m 50%');
    expect(steps.map((s) => s.seconds / 60)).toEqual([10, 10, 5, 10, 5, 10, 5, 10]);
  });

  it('lit tous les modèles de la bibliothèque', () => {
    for (const t of TEMPLATES) expect(parseWorkout(t.description).length).toBeGreaterThan(0);
  });
});

describe('workoutStats', () => {
  it('donne 100 de charge pour 1 h à 100 % FTP', () => {
    expect(workoutStats(parseWorkout('- 1h 100%'))).toEqual({ seconds: 3600, meters: 0, load: 100, intensity: 1, complete: true });
  });

  it("retrouve le calcul d'Intervals.icu sur une séance de référence", () => {
    // Séance créée sur Intervals.icu au spike : 2340 s, intensité 78,4 %, charge 40.
    const ref = workoutStats(parseWorkout('Échauffement\n- 10m ramp 50-75%\n\n3x\n- 5m 95%\n- 3m 55%\n\n- 5m 50%'));
    expect(ref.seconds).toBe(2340);
    expect(ref.load).toBe(40);
    expect(Math.abs(ref.intensity - 0.784)).toBeLessThan(0.01);
  });

  it('estime le seuil 3×10 dans des ordres de grandeur réalistes', () => {
    const s = workoutStats(parseWorkout(TEMPLATES[2].description));
    expect(s.seconds).toBe(70 * 60);
    expect(s.load).toBeGreaterThan(60);
    expect(s.load).toBeLessThan(90);
  });

  it('gère une séance vide', () => {
    expect(workoutStats([])).toEqual({ seconds: 0, meters: 0, load: 0, intensity: 0, complete: true });
  });

  it('paliers en distance : durée et charge laissées à Intervals.icu', () => {
    const s = workoutStats(parseWorkout('- 10m 70% Pace\n\n6x\n- 400mtr 105% Pace\n- 90s 60% Pace'));
    expect(s).toMatchObject({ seconds: 600 + 6 * 90, meters: 2400, complete: false });
  });

  it('zones de couleur propres à chaque cible', () => {
    expect(zoneColor(95)).toBe('var(--yellow)');
    expect(zoneColor(95, 'hr')).toBe('var(--yellow)');
    expect(zoneColor(85, 'hr')).toBe('var(--blue)');
    expect(zoneColor(110, 'pace')).toBe('var(--red)');
  });
});
