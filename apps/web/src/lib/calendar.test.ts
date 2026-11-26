import { describe, expect, it } from 'vitest';
import { countdownLabel, daysBetween, formatRaceDistance, formatTarget, monthGrid, needsResync, nextFreeDay, shiftWorkouts, weekLoad } from './calendar';
import type { AppEvent } from '@/services/calendarApi';

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

describe('calendrier : grille du mois', () => {
  it('retourne une grille 5-6 semaines (lundi-dimanche)', () => {
    const grid = monthGrid('2026-12-15'); // décembre 2026
    expect(grid.length).toBeGreaterThanOrEqual(5);
    expect(grid.length).toBeLessThanOrEqual(6);
    // Chaque semaine : 7 jours, lundi à dimanche
    grid.forEach((week) => {
      expect(week.length).toBe(7);
    });
  });

  it('marque les jours du mois courant et les autres', () => {
    const grid = monthGrid('2026-12-15');
    const decDays = grid.flat().filter((d) => d.isCurrentMonth);
    const otherDays = grid.flat().filter((d) => !d.isCurrentMonth);
    // Décembre 2026 a 31 jours
    expect(decDays.length).toBe(31);
    // Les premiers jours (du mois précédent) et les derniers (du suivant)
    expect(otherDays.length).toBeGreaterThan(0);
  });

  it('commence le lundi et finit le dimanche', () => {
    const grid = monthGrid('2026-12-15');
    const firstDay = new Date(`${grid[0][0].date}T00:00:00Z`);
    const lastDay = new Date(`${grid[grid.length - 1][6].date}T00:00:00Z`);
    expect(firstDay.getUTCDay()).toBe(1); // 1 = lundi
    expect(lastDay.getUTCDay()).toBe(0); // 0 = dimanche
  });
});

describe('calendrier : prochain jour libre', () => {
  it('trouve le prochain jour sans séance et disponible', () => {
    const busy = new Set(['2026-11-24', '2026-11-25']);
    const unavailable = (day: string) => day === '2026-11-27'; // mercredi indisponible
    const free = nextFreeDay('2026-11-23', busy, unavailable);
    expect(free).toBe('2026-11-26'); // jeudi, ni occupé ni indisponible
  });

  it('saute les jours occupés et les jours indisponibles', () => {
    const busy = new Set(['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-28']);
    const unavailable = (day: string) => ['2026-11-27', '2026-11-29'].includes(day);
    const free = nextFreeDay('2026-11-23', busy, unavailable);
    expect(free).toBe('2026-11-30'); // dimanche libre
  });

  it('retourne null si aucun jour libre trouvé dans la limite', () => {
    const busy = new Set(Array.from({ length: 14 }, (_, i) => dayString(i)));
    const unavailable = () => false;
    const free = nextFreeDay('2026-11-23', busy, unavailable, 14);
    expect(free).toBeNull();
  });

  it('utilise la limite par défaut de 14 jours', () => {
    const busy = new Set(['2026-11-24']);
    const unavailable = () => false;
    // Si on part du 23 et qu'on cherche 14 jours, le 25 est à portée
    const free = nextFreeDay('2026-11-23', busy, unavailable);
    expect(free).toBe('2026-11-25');
  });

  function dayString(offsetDays: number): string {
    const d = new Date('2026-11-24T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().split('T')[0];
  }
});

describe('calendrier : décaler les séances', () => {
  it('décale les séances WORKOUT de 7 jours', () => {
    const events: AppEvent[] = [
      {
        id: 1,
        category: 'WORKOUT',
        name: 'Endurance 2 h',
        type: 'Ride',
        description: '',
        start_date_local: '2026-11-24T08:00:00',
      } as AppEvent,
      {
        id: 2,
        category: 'WORKOUT',
        name: 'Sweet spot',
        type: 'Run',
        description: '',
        start_date_local: '2026-11-25T10:00:00',
      } as AppEvent,
    ];
    const shifted = shiftWorkouts(events, 7);
    expect(shifted).toHaveLength(2);
    expect(shifted[0].date).toBe('2026-12-01');
    expect(shifted[0].name).toBe('Endurance 2 h');
    expect(shifted[1].date).toBe('2026-12-02');
    expect(shifted[1].sport).toBe('Run');
  });

  it('ignore les événements non-WORKOUT', () => {
    const events: AppEvent[] = [
      {
        id: 1,
        category: 'WORKOUT',
        name: 'Séance',
        type: 'Ride',
        description: '',
        start_date_local: '2026-11-24T08:00:00',
      } as AppEvent,
      {
        id: 2,
        category: 'RACE_A',
        name: 'Compétition',
        start_date_local: '2026-11-25T10:00:00',
      } as AppEvent,
    ];
    const shifted = shiftWorkouts(events, 7);
    expect(shifted).toHaveLength(1);
    expect(shifted[0].name).toBe('Séance');
  });

  it('préserve la description lors du décalage', () => {
    const events: AppEvent[] = [
      {
        id: 1,
        category: 'WORKOUT',
        name: 'Intervalles',
        type: 'Ride',
        description: '- 10m 95-100%\n- 5x (3m 110% | 2m recovery)',
        start_date_local: '2026-11-24T08:00:00',
      } as AppEvent,
    ];
    const shifted = shiftWorkouts(events, 1);
    expect(shifted[0].description).toBe('- 10m 95-100%\n- 5x (3m 110% | 2m recovery)');
  });
});

describe('calendrier : charge de la semaine', () => {
  it('compte la charge incluse dans une fin de semaine (après 18h)', () => {
    const events: AppEvent[] = [
      {
        id: 1,
        category: 'WORKOUT',
        name: 'Sortie tardive',
        type: 'Ride',
        description: '- 60m 90-100%',
        start_date_local: '2026-11-29T18:00:00',
      } as AppEvent,
    ];
    const result = weekLoad(events, [], '2026-11-23', '2026-11-29');
    expect(result.plannedCount).toBe(1);
    expect(result.planned).toBeGreaterThan(0);
  });
});
