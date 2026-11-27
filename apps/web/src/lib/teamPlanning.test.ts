import { describe, expect, it } from 'vitest';
import { cellKind, dominantColor, textOn, shortDuration, filterByGroup, selectionSummary, isOverload, weekCounts } from './teamPlanning';
import type { Group, TeamCalendarAthlete, TeamCalendarDay } from '@/types';

describe('teamPlanning', () => {
  describe('cellKind', () => {
    it('détermine le type de cellule', () => {
      const workoutDay: TeamCalendarDay = {
        date: '2026-11-23',
        availability: null,
        workouts: [{ id: '1', name: 'Séance', description: null, sport: 'Ride', load: 100, seconds: 3600, done: false }],
        races: [],
        activities: [],
      };
      expect(cellKind(workoutDay)).toBe('workout');

      const extraDay: TeamCalendarDay = {
        date: '2026-11-23',
        availability: null,
        workouts: [],
        races: [],
        activities: [{ id: '1', name: 'Sortie', moving_time: 3600, load: 100 }],
      };
      expect(cellKind(extraDay)).toBe('extra');

      const restDay: TeamCalendarDay = {
        date: '2026-11-23',
        availability: 'repos',
        workouts: [],
        races: [],
        activities: [],
      };
      expect(cellKind(restDay)).toBe('off');

      const freeDay: TeamCalendarDay = {
        date: '2026-11-23',
        availability: null,
        workouts: [],
        races: [],
        activities: [],
      };
      expect(cellKind(freeDay)).toBe('free');
    });
  });

  describe('shortDuration', () => {
    it('formate les durées courtes', () => {
      expect(shortDuration(3600)).toBe('1h');
      expect(shortDuration(5400)).toBe('1h30');
      expect(shortDuration(2700)).toBe('45m');
      expect(shortDuration(60)).toBe('1 min');
      expect(shortDuration(0)).toBe('·');
      expect(shortDuration(null)).toBe('·');
    });
  });

  describe('filterByGroup', () => {
    it('filtre les athlètes par groupe', () => {
      const athletes: TeamCalendarAthlete[] = [
        { id: '1', name: 'Alice', ftp: 200, form: 10, groupIds: ['g1'], error: null, days: [], load: { planned: 0, done: 0, usual: null } },
        { id: '2', name: 'Bob', ftp: 200, form: 10, groupIds: ['g2'], error: null, days: [], load: { planned: 0, done: 0, usual: null } },
        { id: '3', name: 'Charlie', ftp: 200, form: 10, groupIds: ['g1', 'g2'], error: null, days: [], load: { planned: 0, done: 0, usual: null } },
      ];

      const group1: Group = { id: 'g1', name: 'Route', athleteIds: ['1', '3'] };
      expect(filterByGroup(athletes, group1).map((a) => a.id)).toEqual(['1', '3']);

      expect(filterByGroup(athletes, null)).toEqual(athletes);
    });
  });

  describe('selectionSummary', () => {
    it('résume une sélection simple', () => {
      const athletes: TeamCalendarAthlete[] = [
        { id: '1', name: 'Hugo', ftp: 200, form: 10, groupIds: [], error: null, days: [], load: { planned: 0, done: 0, usual: null } },
        { id: '2', name: 'Léa', ftp: 200, form: 10, groupIds: [], error: null, days: [], load: { planned: 0, done: 0, usual: null } },
      ];

      const cells = [
        { athleteId: '1', date: '2026-11-25' },
        { athleteId: '2', date: '2026-11-25' },
      ];

      const summary = selectionSummary(cells, athletes);
      expect(summary).toContain('Hugo');
      expect(summary).toContain('Léa');
      expect(summary.toLowerCase()).toContain('mercredi');
      expect(summary).toContain('25');
    });

    it('résume une sélection multi-jours', () => {
      const athletes: TeamCalendarAthlete[] = [
        { id: '1', name: 'Alice', ftp: 200, form: 10, groupIds: [], error: null, days: [], load: { planned: 0, done: 0, usual: null } },
      ];

      const cells = [
        { athleteId: '1', date: '2026-11-25' },
        { athleteId: '1', date: '2026-11-26' },
        { athleteId: '1', date: '2026-11-27' },
      ];

      const summary = selectionSummary(cells, athletes);
      expect(summary).toContain('Alice');
      expect(summary).toContain('3 jours');
    });
  });

  describe('isOverload', () => {
    it('détecte la surcharge', () => {
      expect(isOverload({ planned: 229, usual: 200 })).toBe(false);
      expect(isOverload({ planned: 231, usual: 200 })).toBe(true);
      expect(isOverload({ planned: 230, usual: null })).toBe(false);
    });
  });

  describe('weekCounts', () => {
    it('compte les séances et cases libres', () => {
      const athletes: TeamCalendarAthlete[] = [
        {
          id: '1',
          name: 'Alice',
          ftp: 200,
          form: 10,
          groupIds: [],
          error: null,
          days: [
            { date: '2026-11-23', availability: null, workouts: [{ id: '1', name: 'Séance', description: null, sport: 'Ride', load: 100, seconds: 3600, done: false }], races: [], activities: [] },
            { date: '2026-11-24', availability: null, workouts: [], races: [], activities: [] },
            { date: '2026-11-25', availability: 'repos', workouts: [], races: [], activities: [] },
          ],
          load: { planned: 0, done: 0, usual: null },
        },
      ];

      const counts = weekCounts(athletes);
      expect(counts.planned).toBe(1);
      expect(counts.free).toBe(1);
    });
  });

  describe('dominantColor', () => {
    it("prend la zone qui cumule le plus de temps, pas l'échauffement", () => {
      const sst = '- 15m ramp 50-75%\n\n3x\n- 12m 88-93%\n- 4m 55%\n\n- 10m 50%';
      expect(dominantColor(sst)).toBe('var(--green)'); // 88-93 % → milieu 90,5 % : zone 3
      expect(textOn(dominantColor(sst))).toBe('rgba(0, 0, 0, 0.85)');
    });
    it('séance sans structure : fond neutre', () => {
      expect(dominantColor(null)).toBe('var(--fill-2)');
    });
  });
});
