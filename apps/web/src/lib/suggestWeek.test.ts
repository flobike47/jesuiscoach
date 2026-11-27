import { describe, expect, it } from 'vitest';
import { suggestForWeek } from './suggestWeek';
import type { TeamCalendarAthlete } from '@/types';

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
const athlete = (id: string, workouts: Record<string, string>): TeamCalendarAthlete => ({
  id,
  name: id,
  ftp: 250,
  form: 0,
  groupIds: [],
  error: null,
  load: { planned: 0, done: 0, usual: null },
  days: days('2026-11-14', 20).map((date) => ({
    date,
    availability: null,
    races: [],
    activities: [],
    workouts: workouts[date] ? [{ id: date, name: 'x', description: workouts[date], sport: 'Ride', load: 50, seconds: 3600, done: true }] : [],
  })),
});
const SEUIL = '- 10m 97%';
const VO2 = '- 4m 115%';
const SST = '- 12m 90%';

describe('suggestForWeek', () => {
  it('suggère le seuil à un groupe qui n’en a pas fait depuis 12 jours', () => {
    const team = [athlete('a', { '2026-11-15': SEUIL, '2026-11-25': VO2, '2026-11-24': SST }), athlete('b', {})];
    const s = suggestForWeek(team, [{ id: 'r', name: 'Route', athleteIds: ['a', 'b'] }], '2026-11-27');
    expect(s?.kind).toBe('seuil');
    expect(s?.message).toBe('Le groupe Route n’a pas fait de séance de seuil depuis 12 jours.');
    expect(s?.template).toBe('Seuil 3×10');
  });

  it('une séance déjà prévue couvre la qualité', () => {
    const team = [athlete('a', { '2026-11-29': SEUIL, '2026-11-25': VO2, '2026-11-24': SST })];
    expect(suggestForWeek(team, [], '2026-11-27')).toBeNull();
  });

  it('sans groupe : toute l’équipe', () => {
    const s = suggestForWeek([athlete('a', {})], [], '2026-11-27');
    expect(s?.message).toMatch(/^L’équipe n’a pas fait de séance de seuil depuis plus de \d+ jours\.$/);
  });
});
