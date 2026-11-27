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
      ridesToday: 0,
    });
  });

  it('compte les athlètes par statut', () => {
    const athletes: TeamDayAthlete[] = [
      { id: '1', name: 'Alice', status: 'done', planned: [], done: [], error: undefined } as unknown as TeamDayAthlete,
      { id: '2', name: 'Bob', status: 'done', planned: [], done: [], error: undefined } as unknown as TeamDayAthlete,
      { id: '3', name: 'Charlie', status: 'planned', planned: [{ id: '1', category: 'WORKOUT' }] as unknown as TeamDayAthlete['planned'], done: [], error: undefined } as unknown as TeamDayAthlete,
      { id: '4', name: 'David', status: 'planned', planned: [{ id: '2', category: 'WORKOUT' }, { id: '3', category: 'WORKOUT' }] as unknown as TeamDayAthlete['planned'], done: [], error: undefined } as unknown as TeamDayAthlete,
      { id: '5', name: 'Eve', status: 'missed', planned: [], done: [], error: undefined } as unknown as TeamDayAthlete,
    ];

    const result = todayCounts(athletes);
    expect(result.doneWorkouts).toBe(2);
    expect(result.stillPlanned).toBe(2);
    expect(result.totalWorkouts).toBe(3);
    expect(result.toWatch).toBe(1);
  });

  it("compte les sorties du jour, prévues ou non (hors plan compris)", () => {
    const athletes = [
      { id: '1', name: 'A', status: 'extra', planned: [], done: [{ id: 'x' }] },
      { id: '2', name: 'B', status: 'done', planned: [{ id: 'p', category: 'WORKOUT' }], done: [{ id: 'y' }] },
      { id: '3', name: 'C', status: 'rest', planned: [], done: [] },
    ] as unknown as TeamDayAthlete[];
    const r = todayCounts(athletes);
    expect(r.ridesToday).toBe(2);
    expect(r.totalWorkouts).toBe(1);
    expect(r.toWatch).toBe(0);
  });
});
