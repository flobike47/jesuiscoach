import { describe, expect, it } from 'vitest';
import { parseWorkout, TEMPLATES, workoutStats } from './workout';
import { blocksToText, durationStep, formatDurationToken, isBlockEditable, move, newBlock, textToBlocks, type Block } from './workoutBlocks';

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
      { kind: 'ramp', seconds: 900, from: 50, to: 75, title: 'Échauffement' },
      {
        kind: 'repeat',
        count: 3,
        steps: [
          { kind: 'step', seconds: 600, low: 95, high: 100 },
          { kind: 'step', seconds: 300, low: 55, high: 55 },
        ],
      },
      { kind: 'step', seconds: 600, low: 50, high: 50, title: 'Retour au calme' },
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
      { kind: 'step', id: 'x', seconds: 225, low: 88, high: 93 },
    ]);
    expect(text).toBe('Échauffement\n- 10m ramp 50-75%\n\n3x\n- 5m 100%\n- 3m 55%\n\n- 3m45s 88-93%');
  });
});

describe('isBlockEditable', () => {
  it('accepte les séances de la bibliothèque', () => {
    for (const t of TEMPLATES) expect(isBlockEditable(t.description)).toBe(true);
  });

  it('refuse ce que les blocs perdraient (cadence, zones, cardio)', () => {
    expect(isBlockEditable('- 10m 90rpm 70%')).toBe(false);
    expect(isBlockEditable('- 10m Z2')).toBe(false);
    expect(isBlockEditable('- 20m 75% HR')).toBe(false);
    expect(isBlockEditable('Consigne : 90 rpm')).toBe(false);
  });
});

describe('réglages au toucher', () => {
  it('pas de durée progressif', () => {
    expect(durationStep(30, 1)).toBe(45);
    expect(durationStep(60, 1)).toBe(90);
    expect(durationStep(60, -1)).toBe(45);
    expect(durationStep(600, 1)).toBe(660);
    expect(durationStep(1800, 1)).toBe(2100);
    expect(durationStep(5, -1)).toBe(5);
  });

  it('déplace un bloc sans sortir de la liste', () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
