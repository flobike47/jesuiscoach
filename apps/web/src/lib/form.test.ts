import { describe, expect, it } from 'vitest';
import { formZone, gaugePosition } from './form';

describe('formZone', () => {
  it('detecte la surcharge (< -30)', () => {
    const zone = formZone(-31);
    expect(zone.key).toBe('risk');
    expect(zone.label).toBe('Surcharge');
    expect(zone.color).toBe('var(--red)');
  });

  it('detecte la productivite (-30 a -10)', () => {
    const zone = formZone(-15);
    expect(zone.key).toBe('productive');
    expect(zone.label).toBe('Productif');
    expect(zone.color).toBe('var(--green)');
  });

  it('detecte la neutralite (-10 a 5)', () => {
    const zone = formZone(0);
    expect(zone.key).toBe('neutral');
    expect(zone.label).toBe('Neutre');
    expect(zone.color).toBe('var(--gray)');
  });

  it('detecte la fraicheur (5 a 25)', () => {
    const zone = formZone(10);
    expect(zone.key).toBe('fresh');
    expect(zone.label).toBe('Frais');
    expect(zone.color).toBe('var(--blue)');
  });

  it('detecte le desentrainement (> 25)', () => {
    const zone = formZone(26);
    expect(zone.key).toBe('transition');
    expect(zone.label).toBe('Désentraînement');
    expect(zone.color).toBe('var(--yellow)');
  });

  it('valide les bornes exactes', () => {
    expect(formZone(-30).key).toBe('productive');
    expect(formZone(-10).key).toBe('neutral');
    expect(formZone(5).key).toBe('fresh');
    expect(formZone(25).key).toBe('transition');
  });

  it('fournit des conseils et libelles athlete', () => {
    const zone = formZone(-15);
    expect(zone.athleteLabel).toBe('En progression');
    expect(zone.advice).toContain('bien');
  });
});

describe('gaugePosition', () => {
  it('position a -50 est 0%', () => {
    expect(gaugePosition(-50)).toBe(0);
  });

  it('position a -30 (fin du 1er segment) est proportionnelle', () => {
    const proportions = [1.2, 1.6, 1, 1.3, 0.9];
    const totalWidth = proportions.reduce((a, b) => a + b, 0); // 5.9
    const expected = (1.2 / totalWidth) * 100;
    expect(gaugePosition(-30)).toBeCloseTo(expected, 1);
  });

  it('position a 0 (au milieu du 3e segment)', () => {
    const proportions = [1.2, 1.6, 1, 1.3, 0.9];
    const totalWidth = proportions.reduce((a, b) => a + b, 0);
    const cumulative = 1.2 + 1.6; // 2.8
    const range = 5 - (-10); // 15
    const posInSegment = (0 - (-10)) / range; // 10/15 = 2/3
    const expected = ((cumulative + posInSegment * 1) / totalWidth) * 100;
    expect(gaugePosition(0)).toBeCloseTo(expected, 1);
  });

  it('position a 40 est 100%', () => {
    expect(gaugePosition(40)).toBeCloseTo(100, 5);
  });

  it('clampe les valeurs hors limites', () => {
    expect(gaugePosition(-100)).toBe(0);
    expect(gaugePosition(100)).toBeCloseTo(100, 5);
  });
});
