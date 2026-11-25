import { describe, expect, it } from 'vitest';
import { formatClock, formatInput, normalize, parseInput, stepValue } from './numberInput';

const FTP = { min: 50, max: 600, step: 1 };
const WEIGHT = { min: 30, max: 200, step: 0.1 };

describe('parseInput', () => {
  it('lit les nombres avec virgule ou point', () => {
    expect(parseInput('245', 'number')).toBe(245);
    expect(parseInput(' 70,5 ', 'number')).toBe(70.5);
    expect(parseInput('70.5', 'number')).toBe(70.5);
  });

  it('lit les durées et allures', () => {
    expect(parseInput('4:35', 'clock')).toBe(275);
    expect(parseInput('1:05:30', 'clock')).toBe(3930);
    expect(parseInput('90', 'clock')).toBe(90);
  });

  it('refuse le vide et l’illisible', () => {
    expect(parseInput('', 'number')).toBeNull();
    expect(parseInput('abc', 'number')).toBeNull();
    expect(parseInput('4:75', 'clock')).toBeNull();
    expect(parseInput('4,5', 'clock')).toBeNull();
  });
});

describe('normalize et stepValue', () => {
  it('borne et signale une saisie hors limites', () => {
    expect(normalize(700, FTP)).toEqual({ value: 600, clamped: true });
    expect(normalize(245.6, FTP)).toEqual({ value: 246, clamped: false });
    expect(normalize(70.55, WEIGHT)).toEqual({ value: 70.6, clamped: false });
  });

  it('avance par pas, sans dépasser les bornes', () => {
    expect(stepValue(245, 1, FTP)).toBe(246);
    expect(stepValue(600, 1, FTP)).toBe(600);
    expect(stepValue(70, -1, WEIGHT)).toBe(69.9);
    expect(stepValue(null, 1, FTP)).toBe(51);
  });
});

describe('affichage', () => {
  it('formate pour le champ', () => {
    expect(formatInput(70.5, 'number', 0.1)).toBe('70,5');
    expect(formatInput(245, 'number', 1)).toBe('245');
    expect(formatInput(275, 'clock', 5)).toBe('4:35');
    expect(formatClock(3930)).toBe('1:05:30');
  });
});
