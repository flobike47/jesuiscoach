import { describe, expect, it } from 'vitest';
import { countdownLabel, daysBetween, formatRaceDistance, formatTarget, needsResync } from './calendar';

describe('calendrier : décompte', () => {
  it('compte les jours entre deux dates, sans décalage d’heure', () => {
    expect(daysBetween('2026-12-10', '2026-11-28')).toBe(12);
    expect(daysBetween('2026-03-29', '2026-03-28')).toBe(1); // passage à l’heure d’été
    expect(daysBetween('2026-11-01', '2026-11-28')).toBe(-27);
  });

  it('écrit le décompte en français', () => {
    expect(countdownLabel(-3)).toBe('passée');
    expect(countdownLabel(0)).toBe("aujourd'hui");
    expect(countdownLabel(1)).toBe('demain');
    expect(countdownLabel(42)).toBe('dans 42 j');
  });
});

describe('calendrier : libellés', () => {
  it('formate une valeur cible avec son unité', () => {
    expect(formatTarget('ftp', 280)).toBe('280 W');
    expect(formatTarget('other', null)).toBe('');
    expect(formatTarget(null, 3)).toBe('3');
  });

  it('formate une distance de compétition', () => {
    expect(formatRaceDistance(175_000)).toBe('175 km');
    expect(formatRaceDistance(800)).toBe('800 m');
    expect(formatRaceDistance(null)).toBe('');
  });

  it('signale les lignes à renvoyer', () => {
    expect(needsResync('error')).toBe(true);
    expect(needsResync('synced')).toBe(false);
    expect(needsResync(undefined)).toBe(false);
  });
});
