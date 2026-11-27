// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { blockEnd, blockWorkouts, overlapsSource } from './blockCopy';
import { addDays, daysBetween, mondayOf, sendProblem, sendReport, weekdayOf } from './batchSend';

const ev = (date: string, name: string, extra: Partial<{ category: string; description: string; type: string }> = {}) => ({
  category: 'WORKOUT',
  start_date_local: `${date}T00:00:00`,
  name,
  description: '- 1h 70%',
  type: 'Ride',
  ...extra,
});

describe('dates du bloc', () => {
  it("compte les jours sans se tromper à l'heure d'été ni au changement d'année", () => {
    expect(daysBetween('2026-03-23', '2026-03-30')).toBe(7);
    expect(daysBetween('2026-10-19', '2026-10-26')).toBe(7);
    expect(addDays('2026-03-27', 3)).toBe('2026-03-30');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('trouve le lundi et le jour de la semaine', () => {
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
    expect(weekdayOf('2026-11-24')).toBe(1);
    expect(blockEnd('2026-11-23', 2)).toBe('2026-12-06');
  });
});

describe('blockWorkouts', () => {
  const events = [
    ev('2026-03-24', 'Seuil'),
    ev('2026-03-29', 'Longue'),
    ev('2026-04-02', 'Footing', { type: 'Run' }),
    ev('2026-04-06', 'Hors bloc'),
    ev('2026-03-22', 'Avant le bloc'),
    ev('2026-03-26', 'Course', { category: 'RACE_A' }),
    ev('2026-03-27', 'Note', { category: 'NOTE' }),
    ev('2026-03-28', 'Sortie libre', { description: '  ' }),
    ev('2026-03-25', 'Natation', { type: 'Swim' }),
    ev('2026-03-25', 'Home trainer', { type: 'VirtualRide' }),
  ];

  it("garde les séances prévues du bloc, en jours depuis son lundi, à travers l'heure d'été", () => {
    const { workouts } = blockWorkouts(events, '2026-03-23', 2);
    expect(workouts.map((w) => [w.day, w.name, w.sport])).toEqual([
      [1, 'Seuil', 'Ride'],
      [2, 'Natation', 'Swim'],
      [2, 'Home trainer', 'Ride'],
      [6, 'Longue', 'Ride'],
      [10, 'Footing', 'Run'],
    ]);
  });

  it('écarte compétitions et notes, et compte les séances sans structure', () => {
    const { workouts, skipped } = blockWorkouts(events, '2026-03-23', 1);
    expect(workouts.map((w) => w.name)).not.toContain('Course');
    expect(workouts.map((w) => w.name)).not.toContain('Note');
    expect(skipped).toBe(1);
  });

  it('un bloc vide ne renvoie rien', () => {
    expect(blockWorkouts([], '2026-03-23', 4)).toEqual({ workouts: [], skipped: 0 });
  });
});

describe('overlapsSource', () => {
  it('signale un bloc recopié sur lui-même', () => {
    expect(overlapsSource('2026-03-23', '2026-03-30', 2)).toBe(true);
    expect(overlapsSource('2026-03-23', '2026-03-16', 2)).toBe(true);
    expect(overlapsSource('2026-03-23', '2026-04-06', 2)).toBe(false);
  });
});

describe('sendProblem', () => {
  it.each([
    [0, 1, /Aucune séance/],
    [3, 0, /au moins un athlète/],
    [41, 1, /40 au plus/],
    [31, 4, /124 séances à créer : 120 au plus/],
  ])('%i séances × %i athlètes : refusé', (workouts, athletes, message) => {
    expect(sendProblem(workouts, athletes)).toMatch(message);
  });

  it('accepte un envoi dans les bornes', () => {
    expect(sendProblem(40, 3)).toBeNull();
  });
});

describe('sendReport', () => {
  it('résume un envoi réussi et détaille les échecs par athlète', () => {
    expect(sendReport(3, [{ id: 'a', ok: true, created: 3 }, { id: 'b', ok: true, created: 3 }], (id) => id)).toEqual({ ok: true, text: '6 séances créées.' });
    const partial = sendReport(3, [{ id: 'a', ok: true, created: 3 }, { id: 'b', ok: false, created: 1, error: 'refus' }], (id) => id.toUpperCase());
    expect(partial).toEqual({ ok: false, text: 'Envoi incomplet. B : 1/3 créées (refus)' });
  });
});
