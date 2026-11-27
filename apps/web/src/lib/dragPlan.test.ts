import { describe, it, expect } from 'vitest';
import { weekLoadAfter, intenseEve, canDrop, dropPreview } from '@/lib/dragPlan';
import type { TeamCalendarAthlete, TeamCalendarDay } from '@/types';

function createMockDay(date: string, overrides?: Partial<TeamCalendarDay>): TeamCalendarDay {
  return {
    date,
    availability: null,
    workouts: [],
    races: [],
    activities: [],
    ...overrides,
  };
}

function createMockAthlete(overrides?: Partial<TeamCalendarAthlete>): TeamCalendarAthlete {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date('2026-11-30');
    d.setDate(d.getDate() + i);
    return createMockDay(d.toISOString().split('T')[0]);
  });

  return {
    id: 'athlete-1',
    name: 'Hugo',
    ftp: 290,
    form: 15,
    groupIds: [],
    error: null,
    load: { planned: 400, done: 300, usual: 450 },
    days,
    ...overrides,
  };
}

describe('dragPlan', () => {
  describe('weekLoadAfter', () => {
    it('calcule l\'augmentation de charge semaine 1', () => {
      const athlete = createMockAthlete({
        days: [
          createMockDay('2026-11-30', { workouts: [{ id: '1', name: 'Séance', description: null, sport: 'Ride', load: 100, seconds: 3600, done: false }] }),
          createMockDay('2026-12-01'),
          createMockDay('2026-12-02'),
          createMockDay('2026-12-03'),
          createMockDay('2026-12-04'),
          createMockDay('2026-12-05'),
          createMockDay('2026-12-06'),
          createMockDay('2026-12-07'),
          createMockDay('2026-12-08'),
          createMockDay('2026-12-09'),
          createMockDay('2026-12-10'),
          createMockDay('2026-12-11'),
          createMockDay('2026-12-12'),
          createMockDay('2026-12-13'),
        ],
      });

      const result = weekLoadAfter(athlete, 0, 85);
      expect(result.before).toBe(100);
      expect(result.after).toBe(185);
      expect(result.pct).toBe(85);
    });

    it('calcule l\'augmentation de charge semaine 2', () => {
      const athlete = createMockAthlete({
        days: [
          createMockDay('2026-11-30'),
          createMockDay('2026-12-01'),
          createMockDay('2026-12-02'),
          createMockDay('2026-12-03'),
          createMockDay('2026-12-04'),
          createMockDay('2026-12-05'),
          createMockDay('2026-12-06'),
          createMockDay('2026-12-07', { workouts: [{ id: '1', name: 'Séance', description: null, sport: 'Ride', load: 150, seconds: 3600, done: false }] }),
          createMockDay('2026-12-08'),
          createMockDay('2026-12-09'),
          createMockDay('2026-12-10'),
          createMockDay('2026-12-11'),
          createMockDay('2026-12-12'),
          createMockDay('2026-12-13'),
        ],
      });

      const result = weekLoadAfter(athlete, 7, 70);
      expect(result.before).toBe(150);
      expect(result.after).toBe(220);
      expect(result.pct).toBe(47);
    });

    it('gère charge zéro avec 0 pct', () => {
      const athlete = createMockAthlete();
      const result = weekLoadAfter(athlete, 0, 50);
      expect(result.before).toBe(0);
      expect(result.after).toBe(50);
      expect(result.pct).toBe(0);
    });

    it('accumule plusieurs séances dans la semaine', () => {
      const athlete = createMockAthlete({
        days: [
          createMockDay('2026-11-30', { workouts: [{ id: '1', name: 'S1', description: null, sport: 'Ride', load: 100, seconds: 3600, done: false }] }),
          createMockDay('2026-12-01', { workouts: [{ id: '2', name: 'S2', description: null, sport: 'Ride', load: 150, seconds: 3600, done: false }] }),
          createMockDay('2026-12-02'),
          createMockDay('2026-12-03'),
          createMockDay('2026-12-04'),
          createMockDay('2026-12-05'),
          createMockDay('2026-12-06'),
          createMockDay('2026-12-07'),
          createMockDay('2026-12-08'),
          createMockDay('2026-12-09'),
          createMockDay('2026-12-10'),
          createMockDay('2026-12-11'),
          createMockDay('2026-12-12'),
          createMockDay('2026-12-13'),
        ],
      });

      const result = weekLoadAfter(athlete, 0, 85);
      expect(result.before).toBe(250);
      expect(result.after).toBe(335);
      expect(result.pct).toBe(34);
    });
  });

  describe('intenseEve', () => {
    it('détecte une séance orange la veille', () => {
      const athlete = createMockAthlete({
        days: [
          createMockDay('2026-11-30', { workouts: [{ id: '1', name: 'Seuil', description: 'Seuil\n- 20m 110%', sport: 'Ride', load: 85, seconds: 1200, done: false }] }),
          createMockDay('2026-12-01'),
          createMockDay('2026-12-02'),
          createMockDay('2026-12-03'),
          createMockDay('2026-12-04'),
          createMockDay('2026-12-05'),
          createMockDay('2026-12-06'),
          createMockDay('2026-12-07'),
          createMockDay('2026-12-08'),
          createMockDay('2026-12-09'),
          createMockDay('2026-12-10'),
          createMockDay('2026-12-11'),
          createMockDay('2026-12-12'),
          createMockDay('2026-12-13'),
        ],
      });

      expect(intenseEve(athlete, '2026-12-01')).toBe(true);
    });

    it('retourne false si pas de séance la veille', () => {
      const athlete = createMockAthlete();
      expect(intenseEve(athlete, '2026-12-01')).toBe(false);
    });

    it('retourne false si date invalide', () => {
      const athlete = createMockAthlete();
      expect(intenseEve(athlete, 'invalid-date')).toBe(false);
    });

    it('gère le changement de mois', () => {
      const athlete = createMockAthlete({
        days: [
          createMockDay('2026-11-30', { workouts: [{ id: '1', name: 'VO2max', description: 'VO2max\n- 4m 125%', sport: 'Ride', load: 84, seconds: 240, done: false }] }),
          createMockDay('2026-12-01'),
          createMockDay('2026-12-02'),
          createMockDay('2026-12-03'),
          createMockDay('2026-12-04'),
          createMockDay('2026-12-05'),
          createMockDay('2026-12-06'),
          createMockDay('2026-12-07'),
          createMockDay('2026-12-08'),
          createMockDay('2026-12-09'),
          createMockDay('2026-12-10'),
          createMockDay('2026-12-11'),
          createMockDay('2026-12-12'),
          createMockDay('2026-12-13'),
        ],
      });

      expect(intenseEve(athlete, '2026-12-01')).toBe(true);
    });
  });

  describe('canDrop', () => {
    it('accepte une case libre', () => {
      const athlete = createMockAthlete();
      expect(canDrop(athlete, '2026-12-02')).toBe(true);
    });

    it('refuse une case avec séance', () => {
      const athlete = createMockAthlete({
        days: [
          createMockDay('2026-11-30'),
          createMockDay('2026-12-01', { workouts: [{ id: '1', name: 'Séance', description: null, sport: 'Ride', load: 100, seconds: 3600, done: false }] }),
          createMockDay('2026-12-02'),
          createMockDay('2026-12-03'),
          createMockDay('2026-12-04'),
          createMockDay('2026-12-05'),
          createMockDay('2026-12-06'),
          createMockDay('2026-12-07'),
          createMockDay('2026-12-08'),
          createMockDay('2026-12-09'),
          createMockDay('2026-12-10'),
          createMockDay('2026-12-11'),
          createMockDay('2026-12-12'),
          createMockDay('2026-12-13'),
        ],
      });

      expect(canDrop(athlete, '2026-12-01')).toBe(false);
    });

    it('refuse une case indisponible', () => {
      const athlete = createMockAthlete({
        days: [
          createMockDay('2026-11-30'),
          createMockDay('2026-12-01', { availability: 'indisponible' }),
          createMockDay('2026-12-02'),
          createMockDay('2026-12-03'),
          createMockDay('2026-12-04'),
          createMockDay('2026-12-05'),
          createMockDay('2026-12-06'),
          createMockDay('2026-12-07'),
          createMockDay('2026-12-08'),
          createMockDay('2026-12-09'),
          createMockDay('2026-12-10'),
          createMockDay('2026-12-11'),
          createMockDay('2026-12-12'),
          createMockDay('2026-12-13'),
        ],
      });

      expect(canDrop(athlete, '2026-12-01')).toBe(false);
    });

    it('refuse un jour de repos prescrit par le coach', () => {
      const athlete = createMockAthlete();
      athlete.days[1] = createMockDay(athlete.days[1].date, { rest: { id: 'r1', name: 'Repos', description: null } });
      expect(canDrop(athlete, athlete.days[1].date)).toBe(false);
      expect(canDrop(athlete, athlete.days[2].date)).toBe(true);
    });

    it('refuse une date non trouvée', () => {
      const athlete = createMockAthlete();
      expect(canDrop(athlete, '2099-01-01')).toBe(false);
    });
  });

  describe('dropPreview', () => {
    it("décrit la dépose sans HTML : jour, charge avant/après, veille intense", () => {
      const athlete = createMockAthlete();
      athlete.load = { planned: 0, done: 0, usual: 50 };
      athlete.days[0].workouts = [{ id: 'w', name: 'VO2', description: '- 4m 115%', sport: 'Ride', load: 40, seconds: 240, done: false }];
      const p = dropPreview(athlete, athlete.days[1].date, 30);
      expect(p.title).toMatch(/^Hugo · \S+ \d+$/);
      expect(p).toMatchObject({ before: 40, after: 70, pct: 75, overload: true, intenseEve: true });
    });
  });
});
