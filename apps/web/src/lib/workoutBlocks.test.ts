import { describe, expect, it } from 'vitest';
import { parseWorkout, TEMPLATES, workoutStats } from './workout';
import { blocksToText, convertBlocks, convertPct, formatDistanceToken, formatDurationToken, isBlockEditable, move, newBlock, textToBlocks, type Block } from './workoutBlocks';

const strip = (blocks: Block[]) => JSON.parse(JSON.stringify(blocks, (k, v) => (k === 'id' ? undefined : v)));

describe('formatDurationToken', () => {
  it.each([
    [600, '10m'],
    [3600, '1h'],
    [5400, '1h30m'],
    [225, '3m45s'],
    [15, '15s'],
  ])('%i s → %s', (s, token) => expect(formatDurationToken(s)).toBe(token));
});

describe('textToBlocks', () => {
  it('lit titres, paliers, plages, rampes et répétitions', () => {
    const blocks = textToBlocks('Échauffement\n- 15m ramp 50-75%\n\n3x\n- 10m 95-100%\n- 5m 55%\n\nRetour au calme\n- 10m 50%');
    expect(strip(blocks)).toEqual([
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

  it('lit cible cardio ou allure, distance et cadence', () => {
    expect(strip(textToBlocks('- 400mtr 105-108% Pace\n\n- 20m 85% LTHR\n\n- 5m 85-90% 55-65rpm\n\n- 10m 70% 90 rpm'))).toEqual([
      { kind: 'step', seconds: 0, meters: 400, target: 'pace', low: 105, high: 108 },
      { kind: 'step', seconds: 1200, meters: 0, target: 'hr', low: 85, high: 85 },
      { kind: 'step', seconds: 300, meters: 0, target: 'power', cadence: { low: 55, high: 65 }, low: 85, high: 90 },
      { kind: 'step', seconds: 600, meters: 0, target: 'power', cadence: { low: 90, high: 90 }, low: 70, high: 70 },
    ]);
  });

  it('ignore une répétition vide', () => {
    expect(textToBlocks('3x\n\n- 10m 70%')).toHaveLength(1);
  });
});

describe('aller-retour texte ⇄ blocs', () => {
  it.each(TEMPLATES.map((t) => [t.name, t.description]))('%s : même séance, mêmes Charge et Intensité', (_, text) => {
    const again = blocksToText(textToBlocks(text));
    expect(parseWorkout(again)).toEqual(parseWorkout(text));
    expect(workoutStats(parseWorkout(again))).toEqual(workoutStats(parseWorkout(text)));
    // Stable : relire le texte produit redonne le même texte.
    expect(blocksToText(textToBlocks(again))).toBe(again);
  });

  it('produit le format attendu par Intervals.icu', () => {
    const text = blocksToText([
      { ...newBlock('ramp'), title: 'Échauffement' },
      newBlock('repeat'),
      { kind: 'step', id: 'x', seconds: 225, meters: 0, target: 'power', cadence: { low: 85, high: 95 }, low: 88, high: 93 },
    ]);
    expect(text).toBe('Échauffement\n- 10m ramp 50-75%\n\n3x\n- 5m 100%\n- 3m 55%\n\n- 3m45s 88-93% 85-95rpm');
  });

  it('course et natation : cibles et distances au format Intervals.icu', () => {
    expect(blocksToText([{ kind: 'step', id: 'a', seconds: 0, meters: 1500, target: 'pace', low: 95, high: 95 }], 'Run')).toBe('- 1.5km 95% Pace');
    expect(blocksToText([{ kind: 'step', id: 'a', seconds: 0, meters: 1500, target: 'pace', low: 95, high: 95 }], 'Swim')).toBe('- 1500mtr 95% Pace');
    expect(blocksToText([{ kind: 'ramp', id: 'a', seconds: 900, meters: 0, target: 'hr', from: 75, to: 88 }], 'Run')).toBe('- 15m ramp 75-88% LTHR');
    expect(formatDistanceToken(400)).toBe('400mtr');
    expect(formatDistanceToken(2000)).toBe('2km');
    expect(blocksToText([newBlock('step', 'Swim')], 'Swim')).toBe('- 200mtr 70% Pace');
    expect(blocksToText([newBlock('step', 'Run')], 'Run')).toBe('- 10m 85% LTHR');
  });
});

describe('isBlockEditable', () => {
  it('accepte les séances de la bibliothèque', () => {
    for (const t of TEMPLATES) expect(isBlockEditable(t.description)).toBe(true);
  });

  it('refuse ce que les blocs perdraient (cadence, zones, cardio)', () => {
    expect(isBlockEditable('- 10m 90rpm 70%')).toBe(false);
    expect(isBlockEditable('- Warmup 10m 60%')).toBe(false);
    expect(isBlockEditable('- 10m 70% 90rpm')).toBe(true);
    expect(isBlockEditable('- 400mtr 105% Pace')).toBe(true);
    expect(isBlockEditable('- 10m Z2')).toBe(false);
    expect(isBlockEditable('- 20m 75% HR')).toBe(false);
    expect(isBlockEditable('Consigne : 90 rpm')).toBe(false);
  });
});

describe('convertPct', () => {
  it('garde une intensité comparable entre puissance, cardio et allure', () => {
    expect(convertPct(100, 'power', 'hr')).toBe(95);
    expect(convertPct(55, 'power', 'hr')).toBe(79);
    expect(convertPct(95, 'hr', 'power')).toBe(100);
    expect(convertPct(105, 'pace', 'power')).toBe(105);
    expect(convertPct(200, 'power', 'hr')).toBe(130);
  });
});

describe('convertBlocks', () => {
  it('adapte une séance vélo à la course : puissance → cardio, cadence retirée', () => {
    const run = convertBlocks(textToBlocks('Échauffement\n- 10m 70% 90rpm\n\n- 20m 85% LTHR'), 'Run');
    expect(blocksToText(run, 'Run')).toBe('Échauffement\n- 10m 85% LTHR\n\n- 20m 85% LTHR');
  });

  it('adapte une séance de natation au vélo : allure → puissance, distance → durée', () => {
    const ride = convertBlocks(textToBlocks('4x\n- 100mtr 90% Pace\n- 20s 40% Pace'), 'Ride');
    expect(blocksToText(ride, 'Ride')).toBe('4x\n- 30s 90%\n- 20s 40%');
  });
});

describe('réglages au toucher', () => {

  it('déplace un bloc sans sortir de la liste', () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
