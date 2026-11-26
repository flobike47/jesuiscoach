import { describe, expect, it } from 'vitest';
import { estimatedSeconds, parseDistance, parseDuration, parseStepLine, parseWorkoutText } from '../src/lib/workoutText.js';

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

describe('parseDistance', () => {
  it('« m » = minutes, « mtr » = mètres', () => {
    expect(parseDistance('400mtr')).toBe(400);
    expect(parseDistance('1mi')).toBe(1609);
    expect(parseDistance('100y')).toBe(91);
    expect(parseDistance('10m')).toBeNull();
  });
});

describe('parseStepLine', () => {
  it('lit un palier, une plage et une rampe', () => {
    expect(parseStepLine('- 10m 95%')).toEqual({ kind: 'step', seconds: 600, meters: 0, target: 'power', low: 95, high: 95 });
    expect(parseStepLine('- 12m 88-93%')).toMatchObject({ kind: 'step', low: 88, high: 93 });
    expect(parseStepLine('- 15m ramp 50-75%')).toEqual({ kind: 'ramp', seconds: 900, meters: 0, target: 'power', from: 50, to: 75 });
  });

  it('lit les cibles cardio, allure, FC max et la cadence', () => {
    expect(parseStepLine('- 20m 80-85% LTHR')).toMatchObject({ seconds: 1200, low: 80, high: 85, target: 'hr' });
    expect(parseStepLine('- 20m 70% HR')).toMatchObject({ target: 'hrmax' });
    expect(parseStepLine('- 8m 97-100% Pace')).toMatchObject({ seconds: 480, target: 'pace' });
    expect(parseStepLine('- 5m 85-90% 55-65rpm')).toMatchObject({ seconds: 300, target: 'power', cadence: { low: 55, high: 65 } });
    expect(parseStepLine('- 10m 70% 90 rpm')).toMatchObject({ cadence: { low: 90, high: 90 }, low: 70 });
  });

  it('lit les paliers en distance', () => {
    expect(parseStepLine('- 400mtr 105% Pace')).toEqual({ kind: 'step', seconds: 0, meters: 400, target: 'pace', low: 105, high: 105 });
    expect(parseStepLine('- 1.5km 85% LTHR')).toMatchObject({ meters: 1500, seconds: 0 });
  });

  it('ignore titres et lignes incomplètes', () => {
    expect(parseStepLine('Échauffement')).toBeNull();
    expect(parseStepLine('- 10m')).toBeNull();
    expect(parseStepLine('- 10m Z2')).toBeNull();
    expect(parseStepLine('- 200w')).toBeNull();
  });
});

describe('parseWorkoutText', () => {
  it('lit titres, paliers, plages, rampes et répétitions', () => {
    const { blocks, unsupported } = parseWorkoutText('Échauffement\n- 15m ramp 50-75%\n\n3x\n- 10m 95-100%\n- 5m 55%\n\nRetour au calme\n- 10m 50%');
    expect(unsupported).toEqual([]);
    expect(blocks).toEqual([
      { kind: 'ramp', seconds: 900, meters: 0, target: 'power', from: 50, to: 75, title: 'Échauffement' },
      {
        kind: 'repeat',
        count: 3,
        steps: [
          { kind: 'step', seconds: 600, meters: 0, target: 'power', low: 95, high: 100 },
          { kind: 'step', seconds: 300, meters: 0, target: 'power', low: 55, high: 55 },
        ],
      },
      { kind: 'step', seconds: 600, meters: 0, target: 'power', low: 50, high: 50, title: 'Retour au calme' },
    ]);
  });

  it('borne le nombre de répétitions à 50', () => {
    const { blocks } = parseWorkoutText('99x\n- 1m 50%');
    expect(blocks[0]).toMatchObject({ kind: 'repeat', count: 50 });
  });

  it('signale ce qu’il ne comprend pas (zones, watts, consignes, FC mal écrite)', () => {
    expect(parseWorkoutText('- 60m Z2').unsupported).toEqual(['- 60m Z2']);
    expect(parseWorkoutText('- 10m 200w').unsupported).toEqual(['- 10m 200w']);
    expect(parseWorkoutText('Consigne : 90 rpm').unsupported).toEqual(['Consigne : 90 rpm']);
    expect(parseWorkoutText('- 10m 90rpm 70%').unsupported).toEqual(['- 10m 90rpm 70%']);
  });

  it('une séance vide ne donne aucun bloc', () => {
    expect(parseWorkoutText('')).toEqual({ blocks: [], unsupported: [] });
  });

  it('estime la durée, répétitions comprises ; les distances sont estimées', () => {
    expect(estimatedSeconds(parseWorkoutText('3x\n- 10m 95%\n- 5m 55%').blocks, 'Ride')).toBe(45 * 60);
    expect(estimatedSeconds(parseWorkoutText('- 1km 90% Pace').blocks, 'Run')).toBe(300);
  });
});
