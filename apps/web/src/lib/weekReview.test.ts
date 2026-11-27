// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TeamCalendarAthlete, TeamCalendarDay } from '@/types';
import { attentionReason, plannedLabel, lastWeekRange, mondayOf, needsAttention, shiftWeek, weekRange, weekReview } from './weekReview';

/** Semaine du lundi 23 au dimanche 29 novembre 2026. */
const FROM = '2026-11-23';
const TO = '2026-11-29';
const dates = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];

type Workout = TeamCalendarDay['workouts'][number];
const w = (load: number | null, done: boolean): Workout => ({ id: `w${Math.random()}`, name: '', description: null, sport: 'Ride', load, seconds: null, done });
const ride = (load: number | null) => ({ id: `a${Math.random()}`, name: null, moving_time: 3600, load });

function athlete(name: string, plan: Partial<Record<number, { workouts?: Workout[]; activities?: ReturnType<typeof ride>[] }>>, usual: number | null, error: string | null = null): TeamCalendarAthlete {
  const days: TeamCalendarDay[] = dates.map((date, i) => ({
    date,
    availability: null,
    rest: null,
    workouts: plan[i]?.workouts ?? [],
    races: [],
    activities: plan[i]?.activities ?? [],
  }));
  return { id: name.toLowerCase(), name, ftp: null, form: null, groupIds: [], error, days: error ? [] : days, load: { planned: 0, done: 0, usual } };
}

describe('semaines', () => {
  it.each([
    ['lundi', '2026-11-30', '2026-11-23'],
    ['dimanche', '2026-11-29', '2026-11-16'],
    ['mercredi en changeant de mois', '2026-12-02', '2026-11-23'],
  ])('la semaine écoulée vue un %s (%s) commence le %s', (_, today, monday) => {
    expect(lastWeekRange(today)).toEqual(weekRange(monday));
  });

  it('calcule le lundi et décale les semaines', () => {
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
    expect(weekRange('2026-11-23')).toEqual({ from: FROM, to: TO });
    expect(shiftWeek('2026-11-23', 1)).toBe('2026-11-30');
    expect(shiftWeek('2026-11-23', -1)).toBe('2026-11-16');
  });
});

describe('weekReview', () => {
  const MONDAY_AFTER = '2026-11-30';

  it('compare charge prévue et faite, et compte les séances manquées', () => {
    const cal = { from: FROM, to: TO, athletes: [athlete('Léa', { 0: { workouts: [w(60, true)], activities: [ride(65)] }, 2: { workouts: [w(80, false)] } }, 300)] };
    const [lea] = weekReview(cal, FROM, TO, MONDAY_AFTER).athletes;
    expect(lea).toMatchObject({ planned: 140, done: 65, sessions: 2, sessionsDone: 1, missed: 1, overUsual: false, usualPct: -78 });
  });

  it("ne compte pas comme manquée une séance d'aujourd'hui ou à venir", () => {
    const cal = { from: FROM, to: TO, athletes: [athlete('Léa', { 2: { workouts: [w(80, false)] }, 4: { workouts: [w(80, false)] } }, 300)] };
    expect(weekReview(cal, FROM, TO, '2026-11-25').athletes[0].missed).toBe(0);
    expect(weekReview(cal, FROM, TO, '2026-11-26').athletes[0].missed).toBe(1);
  });

  it("signale un athlète au-dessus de son habitude de plus de 15 %, d'après la charge faite", () => {
    const cal = {
      from: FROM,
      to: TO,
      athletes: [
        athlete('Hugo', { 1: { activities: [ride(200)] }, 5: { activities: [ride(150)] } }, 300),
        athlete('Sarah', { 1: { activities: [ride(340)] } }, 300),
      ],
    };
    const review = weekReview(cal, FROM, TO, MONDAY_AFTER);
    expect(review.athletes.map((a) => [a.name, a.overUsual, a.usualPct])).toEqual([
      ['Hugo', true, 17],
      ['Sarah', false, 13],
    ]);
    expect(review.totals.overUsual).toBe(1);
  });

  it("ne conclut rien sans habitude connue (nouvel athlète, démo)", () => {
    const cal = { from: FROM, to: TO, athletes: [athlete('Léa', { 1: { activities: [ride(500)] } }, null)] };
    expect(weekReview(cal, FROM, TO, MONDAY_AFTER).athletes[0]).toMatchObject({ overUsual: false, usualPct: null, usual: null });
  });

  it('additionne les charges estimables et compte à part les séances sans charge', () => {
    const cal = { from: FROM, to: TO, athletes: [athlete('Léa', { 1: { workouts: [w(null, false)] } }, 300), athlete('Hugo', { 1: { workouts: [w(50, true), w(null, false)] } }, 300)] };
    const review = weekReview(cal, FROM, TO, MONDAY_AFTER);
    expect(review.athletes.find((a) => a.name === 'Léa')).toMatchObject({ planned: 0, unestimated: 1, sessions: 1 });
    expect(review.athletes.find((a) => a.name === 'Hugo')).toMatchObject({ planned: 50, unestimated: 1, sessions: 2 });
    expect(review.totals).toMatchObject({ planned: 50, unestimated: 2, sessions: 3 });
  });

  it('exclut des totaux un athlète illisible et le place en dernier', () => {
    const cal = {
      from: FROM,
      to: TO,
      athletes: [athlete('Alice', {}, null, 'Intervals.icu indisponible'), athlete('Léa', { 0: { workouts: [w(60, false)] } }, 300), athlete('Zoé', {}, 300)],
    };
    const review = weekReview(cal, FROM, TO, MONDAY_AFTER);
    expect(review.athletes.map((a) => a.name)).toEqual(['Léa', 'Zoé', 'Alice']);
    expect(review.totals).toEqual({ planned: 60, unestimated: 0, done: 0, sessions: 1, sessionsDone: 0, missed: 1, overUsual: 0, unavailable: 1 });
    expect(review.athletes.filter(needsAttention).map((a) => a.name)).toEqual(['Léa']);
  });

  it("ignore les jours hors de la semaine demandée", () => {
    const cal = { from: FROM, to: TO, athletes: [athlete('Léa', { 0: { workouts: [w(60, false)] }, 6: { activities: [ride(40)] } }, 300)] };
    expect(weekReview(cal, '2026-11-24', TO, MONDAY_AFTER).athletes[0]).toMatchObject({ sessions: 0, done: 40 });
  });
});

describe('attentionReason', () => {
  const base = { id: 'x', name: 'X', error: null, planned: 0, unestimated: 0, done: 0, usual: 300, sessions: 0, sessionsDone: 0, missed: 0, overUsual: false, usualPct: 0 };
  it.each([
    [{ overUsual: true, usualPct: 17 }, '+17 % de son habitude'],
    [{ missed: 1 }, '1 séance manquée'],
    [{ overUsual: true, usualPct: 30, missed: 2 }, '+30 % de son habitude · 2 séances manquées'],
  ])('%j → %s', (over, expected) => {
    expect(attentionReason({ ...base, ...over })).toBe(expected);
  });
});

describe('plannedLabel', () => {
  it.each([
    [{ planned: 0, unestimated: 0, sessions: 0 }, 'rien de prévu'],
    [{ planned: 140, unestimated: 0, sessions: 2 }, '140 prévue'],
    [{ planned: 140, unestimated: 1, sessions: 3 }, '140 prévue (+1 non estimée)'],
    [{ planned: 140, unestimated: 2, sessions: 4 }, '140 prévue (+2 non estimées)'],
    [{ planned: 0, unestimated: 3, sessions: 3 }, 'prévue non estimée'],
  ])('%j → %s', (p, expected) => {
    expect(plannedLabel(p)).toBe(expected);
  });
});
