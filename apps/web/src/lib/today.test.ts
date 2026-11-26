import { describe, it, expect } from 'vitest';
import { todayCounts } from './today';
import type { TeamDayAthlete } from '@/services/calendarApi';

describe('todayCounts', () => {
  it('retourne des zéros pour une liste vide', () => {
    const result = todayCounts([]);
    expect(result).toEqual({
      toWatch: 0,
      doneWorkouts: 0,
      totalWorkouts: 0,
      stillPlanned: 0,
    });
  });

  it('compte les athlètes par statut', () => {
    const athletes: TeamDayAthlete[] = [
      { id: '1', name: 'Alice', status: 'done', planned: [], done: [], error: undefined } as unknown as TeamDayAthlete,
      { id: '2', name: 'Bob', status: 'done', planned: [], done: [], error: undefined } as unknown as TeamDayAthlete,
      { id: '3', name: 'Charlie', status: 'planned', planned: [{ id: '1' }] as unknown as TeamDayAthlete['planned'], done: [], error: undefined } as unknown as TeamDayAthlete,
      { id: '4', name: 'David', status: 'planned', planned: [{ id: '2' }, { id: '3' }] as unknown as TeamDayAthlete['planned'], done: [], error: undefined } as unknown as TeamDayAthlete,
      { id: '5', name: 'Eve', status: 'missed', planned: [], done: [], error: undefined } as unknown as TeamDayAthlete,
    ];

    const result = todayCounts(athletes);
    expect(result.doneWorkouts).toBe(2);
    expect(result.stillPlanned).toBe(2);
    expect(result.totalWorkouts).toBe(3);
    expect(result.toWatch).toBe(1);
  });
});
