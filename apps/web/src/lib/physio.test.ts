import { describe, expect, it } from 'vitest';
import { ageOf, formatDay, formatPace, HR_PCT, maxBirthDate, POWER_PCT, todayIso, zonesFrom } from './physio';

describe('formatPace', () => {
  it.each([
    [275, 'Run', '4:35 /km'],
    [115, 'Swim', '1:55 /100 m'],
    [60, 'Run', '1:00 /km'],
  ] as const)('formate %i s en %s : %s', (secs, sport, expected) => {
    expect(formatPace(secs, sport)).toBe(expected);
  });
});

describe('zones de puissance (Coggan, 7 zones)', () => {
  it('calcule les bornes en watts à partir de la FTP', () => {
    const zones = zonesFrom(250, POWER_PCT);
    expect(zones).toHaveLength(7);
    expect(zones[0]).toEqual({ zone: 1, from: null, to: 137 });
    expect(zones[1]).toEqual({ zone: 2, from: 138, to: 187 });
    expect(zones[3]).toEqual({ zone: 4, from: 225, to: 262 });
    expect(zones[6]).toEqual({ zone: 7, from: 375, to: null });
  });

  it('les zones se suivent sans trou ni chevauchement', () => {
    const zones = zonesFrom(312, POWER_PCT);
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].from).toBe((zones[i - 1].to ?? 0) + 1);
    }
  });
});

describe('zones cardio (Friel, 6 zones)', () => {
  it('calcule les bornes en bpm à partir de la FC seuil', () => {
    const zones = zonesFrom(170, HR_PCT);
    expect(zones).toHaveLength(6);
    expect(zones[0]).toEqual({ zone: 1, from: null, to: 137 });
    expect(zones[1]).toEqual({ zone: 2, from: 138, to: 152 });
    expect(zones[4]).toEqual({ zone: 5, from: 170, to: 174 });
    expect(zones[5]).toEqual({ zone: 6, from: 175, to: null });
  });
});

describe('ageOf', () => {
  it.each([
    ['1990-03-14', '2026-11-25', 36],
    ['1990-11-25', '2026-11-25', 36], // anniversaire aujourd'hui
    ['1990-11-26', '2026-11-25', 35], // anniversaire demain
  ])('naissance %s, aujourd’hui %s → %i ans', (birth, today, expected) => {
    expect(ageOf(birth, today)).toBe(expected);
  });
});

describe('dates', () => {
  it('la naissance la plus récente admise a 10 ans, 29 février compris', () => {
    expect(maxBirthDate('2026-11-25')).toBe('2016-11-25');
    expect(maxBirthDate('2028-02-29')).toBe('2018-02-28');
  });

  it('todayIso donne la date locale au format AAAA-MM-JJ', () => {
    expect(todayIso(new Date(2026, 10, 25, 23, 30))).toBe('2026-11-25');
  });

  it('formatDay écrit la date en français', () => {
    expect(formatDay('1990-03-14')).toBe('14 mars 1990');
  });
});
