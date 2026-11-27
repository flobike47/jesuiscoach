// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addDays } from './batchSend';
import { recurrenceDays, recurrenceRange, recurrenceWorkouts } from './recurrence';

describe('recurrenceDays', () => {
  it('tous les mardis pendant 3 semaines, à partir d’un lundi', () => {
    expect(recurrenceDays('2026-11-30', [1], 3)).toEqual([1, 8, 15]);
  });

  it('commence au jour de départ, même en milieu de semaine', () => {
    // Départ un mercredi : le mardi de la première semaine est déjà passé.
    const days = recurrenceDays('2026-12-02', [1, 5], 2);
    expect(days.map((d) => addDays('2026-12-02', d))).toEqual(['2026-12-05', '2026-12-08', '2026-12-12', '2026-12-15']);
  });

  it("garde le jour de la semaine à travers l'heure d'été et le changement d'année", () => {
    const tuesdays = recurrenceDays('2026-03-23', [1], 2).map((d) => addDays('2026-03-23', d));
    expect(tuesdays).toEqual(['2026-03-24', '2026-03-31']);
    const sundays = recurrenceDays('2026-12-21', [6], 3).map((d) => addDays('2026-12-21', d));
    expect(sundays).toEqual(['2026-12-27', '2027-01-03', '2027-01-10']);
  });

  it('plafonne la période à 12 semaines (jour 83 au plus, comme les plans)', () => {
    const every = recurrenceDays('2026-11-30', [0, 1, 2, 3, 4, 5, 6], 20);
    expect(every).toHaveLength(84);
    expect(Math.max(...every)).toBe(83);
  });

  it('sans jour choisi ou sans semaine, aucune occurrence', () => {
    expect(recurrenceDays('2026-11-30', [], 4)).toEqual([]);
    expect(recurrenceDays('2026-11-30', [1], 0)).toEqual([]);
  });
});

describe('recurrenceWorkouts et recurrenceRange', () => {
  it('répète la même séance à chaque occurrence', () => {
    const club = { name: 'Sortie club', description: '- 2h 70%' };
    expect(recurrenceWorkouts(club, '2026-11-30', [1], 2)).toEqual([
      { day: 1, name: 'Sortie club', description: '- 2h 70%', sport: 'Ride' },
      { day: 8, name: 'Sortie club', description: '- 2h 70%', sport: 'Ride' },
    ]);
    expect(recurrenceWorkouts({ ...club, sport: 'Run' }, '2026-11-30', [1], 1)[0].sport).toBe('Run');
  });

  it('donne la première et la dernière date', () => {
    expect(recurrenceRange('2026-11-30', [1, 8, 15])).toEqual({ first: '2026-12-01', last: '2026-12-15' });
    expect(recurrenceRange('2026-11-30', [])).toBeNull();
  });
});
