import { describe, it, expect } from 'vitest';
import type { AppEvent } from '@/services/calendarApi';
import type { Activity } from '@/types';
import { dayMarks, weekPlannedLoad } from './monthView';

describe('monthView : dayMarks', () => {
  it('retourne une barre par séance WORKOUT avec largeur 25-100%', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'WORKOUT',
        start_date_local: '2026-12-08T10:00:00',
        description: '- 1h 65%', // 1 h = 1/3 de 3 h → ~33%
      },
      {
        id: '2',
        category: 'WORKOUT',
        start_date_local: '2026-12-08T14:00:00',
        description: '- 30m 75%', // 30 min = 1/6 de 3 h → ~16% → 25% min
      },
    ];

    const marks = dayMarks('2026-12-08', events, [], []);
    expect(marks.bars.length).toBe(2);
    expect(marks.bars[0].widthPct).toBeGreaterThanOrEqual(25);
    expect(marks.bars[0].widthPct).toBeLessThanOrEqual(100);
    expect(marks.bars[1].widthPct).toBe(25); // Minimum
  });

  it('calcule la zone dominante comme couleur de la barre', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'WORKOUT',
        start_date_local: '2026-12-08T10:00:00',
        description: '- 2h 65%\n- 15m 110%', // Endurance (2h) dominante > VO2 (15m)
      },
    ];

    const marks = dayMarks('2026-12-08', events, [], []);
    expect(marks.bars.length).toBe(1);
    expect(marks.bars[0].color).toBe('var(--blue)'); // 65% = Endurance = bleu
  });

  it('marque comme done si la séance est dans doneEventIds', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'WORKOUT',
        start_date_local: '2026-12-08T10:00:00',
        description: '- 1h 65%',
      },
    ];

    const marks = dayMarks('2026-12-08', events, [], ['1']);
    expect(marks.done).toBe(true);
  });

  it('marque comme done s\'il y a une activité ce jour-là', () => {
    const activities: Activity[] = [
      {
        id: 'act-1',
        start_date_local: '2026-12-08T14:30:00',
      },
    ];

    const marks = dayMarks('2026-12-08', [], activities, []);
    expect(marks.done).toBe(true);
  });

  it('marque race si un événement a category RACE_*', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'RACE_UCI',
        start_date_local: '2026-12-08T09:00:00',
        name: 'Grand Fond',
      },
    ];

    const marks = dayMarks('2026-12-08', events, [], []);
    expect(marks.race).toBe(true);
  });

  it('utilise bleu par défaut si description n\'a pas de zone', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'WORKOUT',
        start_date_local: '2026-12-08T10:00:00',
        description: 'Pas de structure', // Sans structure
      },
    ];

    const marks = dayMarks('2026-12-08', events, [], []);
    expect(marks.bars.length).toBe(1);
    expect(marks.bars[0].color).toBe('var(--blue)');
  });

  it('ignore les événements d\'autres jours', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'WORKOUT',
        start_date_local: '2026-12-07T10:00:00',
        description: '- 1h 65%',
      },
    ];

    const marks = dayMarks('2026-12-08', events, [], []);
    expect(marks.bars.length).toBe(0);
  });
});

describe('monthView : weekPlannedLoad', () => {
  it('somme les charges prévues des séances WORKOUT de la semaine', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'WORKOUT',
        start_date_local: '2026-12-08T10:00:00',
        description: '- 1h 75%',
      },
      {
        id: '2',
        category: 'WORKOUT',
        start_date_local: '2026-12-09T10:00:00',
        description: '- 30m 65%',
      },
      {
        id: '3',
        category: 'RACE_UCI',
        start_date_local: '2026-12-10T10:00:00',
        // Les races ne comptent pas, seulement WORKOUT
      },
    ];

    const weekDays = [
      { date: '2026-12-08' },
      { date: '2026-12-09' },
      { date: '2026-12-10' },
      { date: '2026-12-11' },
      { date: '2026-12-12' },
      { date: '2026-12-13' },
      { date: '2026-12-14' },
    ];

    const load = weekPlannedLoad(weekDays, events);
    // Vérifier que la charge est positive et somme les deux séances
    expect(load).toBeGreaterThan(50);
  });

  it('retourne 0 pour une semaine sans séances', () => {
    const events: AppEvent[] = [];
    const weekDays = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-12-${String(8 + i).padStart(2, '0')}`,
    }));

    const load = weekPlannedLoad(weekDays, events);
    expect(load).toBe(0);
  });

  it('ignore les séances d\'autres jours', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'WORKOUT',
        start_date_local: '2026-12-01T10:00:00', // Avant la semaine
        description: '- 1h 75%',
      },
    ];

    const weekDays = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-12-${String(8 + i).padStart(2, '0')}`,
    }));

    const load = weekPlannedLoad(weekDays, events);
    expect(load).toBe(0);
  });
});
