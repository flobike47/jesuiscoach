// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TeamCalendarAthlete, TeamCalendarDay } from '@/types';
import { athleteLoads, loadScale } from './teamLoad';

const WEEK = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const TODAY = '2026-11-26'; // jeudi

const day = (date: string, planned: number[] = [], doneLoads: number[] = [], doneFlags: boolean[] = []): TeamCalendarDay => ({
  date,
  availability: null,
  workouts: planned.map((load, i) => ({ id: `${date}-${i}`, name: 'Séance', description: null, sport: 'Ride', load, seconds: 3600, done: doneFlags[i] ?? false })),
  races: [],
  activities: doneLoads.map((load, i) => ({ id: `${date}-a${i}`, name: 'Sortie', moving_time: 3600, load })),
});

/** Athlète avec une charge prévue et faite par jour de la semaine (index 0 = lundi). */
const athlete = (name: string, planned: Record<number, number>, done: Record<number, number> = {}, extra: Partial<TeamCalendarAthlete> = {}): TeamCalendarAthlete => ({
  id: name,
  name,
  ftp: 250,
  form: null,
  groupIds: [],
  error: null,
  days: WEEK.map((date, i) => day(date, planned[i] != null ? [planned[i]] : [], done[i] != null ? [done[i]] : [])),
  load: { planned: 0, done: 0, usual: 300 },
  ...extra,
});

describe('athleteLoads', () => {
  it('compare la charge faite à la charge prévue à ce jour, pas à toute la semaine', () => {
    // Prévu lundi 60, mercredi 80, samedi 150 ; fait lundi 62, mercredi 75.
    const [row] = athleteLoads([athlete('Hugo', { 0: 60, 2: 80, 5: 150 }, { 0: 62, 2: 75 })], TODAY);
    expect(row).toMatchObject({ planned: 290, plannedToDate: 140, done: 137, status: 'suit' });
  });

  it("compte une séance du jour seulement quand elle est faite", () => {
    const pending = athlete('Léa', { 3: 70 });
    expect(athleteLoads([pending], TODAY)[0]).toMatchObject({ plannedToDate: 0, status: 'a-venir' });
    const made = athlete('Léa', {}, { 3: 72 }, { days: WEEK.map((d, i) => (i === 3 ? day(d, [70], [72], [true]) : day(d))) });
    expect(athleteLoads([made], TODAY)[0]).toMatchObject({ plannedToDate: 70, done: 72, status: 'suit' });
  });

  it.each([
    ['retard', { 0: 100, 1: 100 }, { 0: 100 }],
    ['au-dessus', { 0: 100 }, { 0: 100, 1: 60 }],
    ['hors-plan', {}, { 1: 50 }],
    ['rien', {}, {}],
  ])('statut %s', (status, planned, done) => {
    expect(athleteLoads([athlete('Sam', planned, done)], TODAY)[0].status).toBe(status);
  });

  it('les plus en retard en tête, données indisponibles en dernier, sans total d’équipe', () => {
    const rows = athleteLoads(
      [
        athlete('Zoé', { 0: 100 }, { 0: 100 }),
        athlete('Bob', { 0: 100 }, {}, { error: 'Connexion Intervals.icu à refaire' }),
        athlete('Ana', { 0: 100 }, { 0: 50 }),
        athlete('Max', { 0: 100 }, { 0: 10 }),
      ],
      TODAY,
    );
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ['Max', 'retard'],
      ['Ana', 'retard'],
      ['Zoé', 'suit'],
      ['Bob', 'indisponible'],
    ]);
    expect(rows[3]).toMatchObject({ planned: 0, done: 0 });
    expect(rows).toHaveLength(4);
  });

  it('une semaine passée se compare en entier, une semaine future n’a rien de dû', () => {
    expect(athleteLoads([athlete('Hugo', { 0: 60, 6: 90 }, { 0: 60 })], '2026-12-07')[0]).toMatchObject({ plannedToDate: 150, status: 'retard' });
    expect(athleteLoads([athlete('Hugo', { 0: 60 })], '2026-11-01')[0]).toMatchObject({ plannedToDate: 0, done: 0, status: 'a-venir' });
  });
});

describe('loadScale', () => {
  it('prend la plus grande charge prévue ou faite, au moins 1', () => {
    expect(loadScale(athleteLoads([athlete('A', { 0: 100 }, { 0: 180 }), athlete('B', { 0: 250 })], TODAY))).toBe(250);
    expect(loadScale([])).toBe(1);
  });
});
