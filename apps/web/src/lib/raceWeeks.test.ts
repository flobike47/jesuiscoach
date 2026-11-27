import { describe, expect, it } from 'vitest';
import { nextRace, raceSubtitle, raceWeekLabel } from './raceWeeks';

const race = { name: 'Grand Fond', date: '2027-01-08', racePriority: 'A' };

describe('raceWeeks', () => {
  it('prend la course A la plus proche, sinon la plus proche', () => {
    const races = [
      { name: 'B proche', date: '2026-12-10', racePriority: 'B' },
      race,
      { name: 'Passée', date: '2026-11-01', racePriority: 'A' },
    ];
    expect(nextRace(races, '2026-11-27')?.name).toBe('Grand Fond');
    expect(nextRace([races[0]], '2026-11-27')?.name).toBe('B proche');
    expect(nextRace([], '2026-11-27')).toBeNull();
  });

  it('sous-titre lisible', () => {
    expect(raceSubtitle(race, '2026-11-27')).toBe('Grand Fond le 8 janvier · dans 6 semaines');
    expect(raceSubtitle(race, '2027-01-07')).toBe('Grand Fond le 8 janvier · demain');
  });

  it('étiquette des semaines avant la course', () => {
    expect(raceWeekLabel('2027-01-04', race)).toBe('Semaine de course · Grand Fond');
    expect(raceWeekLabel('2026-12-28', race)).toBe('Dernière semaine avant la course');
    expect(raceWeekLabel('2026-11-30', race)).toBe('5 semaines avant la course');
    expect(raceWeekLabel('2027-01-11', race)).toBeNull();
    expect(raceWeekLabel('2026-11-30', null)).toBeNull();
  });
});
