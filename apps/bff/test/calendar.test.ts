import { describe, expect, it } from 'vitest';
import { categoryOf, dayStatus, importedFields, parisToday, reconcile, validateEventInput, validateEventPatch, validateGoalInput, type CalendarRow } from '../src/lib/calendar.js';
import type { IntervalsEvent } from '../src/types.js';

const row = (over: Partial<CalendarRow> = {}): CalendarRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'workout',
  sport: 'Ride',
  day: '2026-12-01',
  name: 'Endurance',
  description: null,
  racePriority: null,
  raceDistanceM: null,
  raceGoal: null,
  origin: 'app',
  intervalsId: '900',
  syncStatus: 'synced',
  syncError: null,
  createdBy: 'coach',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...over,
});

const ev = (over: Partial<IntervalsEvent> = {}): IntervalsEvent => ({ id: 900, category: 'WORKOUT', type: 'Ride', start_date_local: '2026-12-01T00:00:00', name: 'Endurance', ...over });

/** Une lecture commencée bien après la dernière modification : une absence compte. */
const LATER = Date.parse('2026-12-31T00:00:00Z');

describe('validateEventInput', () => {
  it('exige un sport pour une séance et une priorité pour une compétition', () => {
    expect(() => validateEventInput({ kind: 'workout', date: '2026-12-01', name: 'Sortie' })).toThrow('sport requis');
    expect(() => validateEventInput({ kind: 'race', date: '2026-12-01', name: 'Marmotte' })).toThrow('priorité');
  });

  it('valide une compétition et garde ses champs', () => {
    expect(validateEventInput({ kind: 'race', date: '2026-12-01', name: '  Marmotte ', racePriority: 'A', raceDistanceM: 175000, raceGoal: 'finir' })).toEqual({
      kind: 'race',
      date: '2026-12-01',
      name: 'Marmotte',
      description: null,
      sport: null,
      racePriority: 'A',
      raceDistanceM: 175000,
      raceGoal: 'finir',
    });
  });

  it("efface le sport d'une note et les champs de compétition d'une séance", () => {
    expect(validateEventInput({ kind: 'note', date: '2026-12-01', name: 'Repos', sport: 'Run', racePriority: 'B' })).toMatchObject({ sport: null, racePriority: null });
    expect(validateEventInput({ kind: 'workout', date: '2026-12-01', name: 'Sortie', sport: 'Run', raceDistanceM: 5000 })).toMatchObject({ raceDistanceM: null });
  });

  it('refuse une date, un kind ou une distance hors bornes', () => {
    expect(() => validateEventInput({ kind: 'note', date: '01/12/2026', name: 'x' })).toThrow('date invalide');
    expect(() => validateEventInput({ kind: 'bidule', date: '2026-12-01', name: 'x' })).toThrow('kind invalide');
    expect(() => validateEventInput({ kind: 'race', date: '2026-12-01', name: 'x', racePriority: 'A', raceDistanceM: 50 })).toThrow('distance invalide');
  });
});

describe('validateEventPatch', () => {
  it('ne retourne que les champs présents', () => {
    expect(validateEventPatch({ name: ' Nouveau nom ' })).toEqual({ name: 'Nouveau nom' });
    expect(validateEventPatch({ description: null })).toEqual({ description: null });
    expect(validateEventPatch({})).toEqual({});
  });

  it('valide les champs présents', () => {
    expect(() => validateEventPatch({ date: 'demain' })).toThrow('date invalide');
    expect(() => validateEventPatch({ sport: 'Golf' })).toThrow('sport invalide');
  });
});

describe('categoryOf', () => {
  it('une compétition devient RACE_ + priorité', () => {
    expect(categoryOf('race', 'B')).toBe('RACE_B');
    expect(categoryOf('workout', null)).toBe('WORKOUT');
    expect(categoryOf('note', null)).toBe('NOTE');
  });
});

describe('importedFields', () => {
  it('importe une compétition avec sa priorité', () => {
    expect(importedFields(ev({ id: 7, category: 'RACE_A', type: undefined, name: 'Marmotte' }))).toMatchObject({
      kind: 'race',
      racePriority: 'A',
      origin: 'intervals',
      intervalsId: '7',
      syncStatus: 'synced',
      createdBy: 'intervals',
    });
  });

  it('ignore les catégories non gérées (HOLIDAY, SICK…) et les événements sans id', () => {
    expect(importedFields(ev({ category: 'HOLIDAY' }))).toBeNull();
    expect(importedFields(ev({ id: undefined }))).toBeNull();
  });

  it('donne un nom de repli et coupe les longs noms', () => {
    expect(importedFields(ev({ name: '   ' }))?.name).toBe('Séance');
    expect(importedFields(ev({ name: 'x'.repeat(200) }))?.name).toHaveLength(120);
  });
});

describe('reconcile', () => {
  it('importe les nouveaux événements gérés, pas les autres', () => {
    const rec = reconcile([], [ev({ id: 1 }), ev({ id: 2, category: 'SICK' })], LATER);
    expect(rec.toInsert.map((r) => r.intervalsId)).toEqual(['1']);
    expect(rec.toRemove).toEqual([]);
    expect(rec.toError).toEqual([]);
  });

  it('retire une ligne importée disparue chez Intervals.icu', () => {
    const r = row({ origin: 'intervals', createdBy: 'intervals', intervalsId: '900' });
    expect(reconcile([r], [], LATER).toRemove).toEqual([r.id]);
  });

  it("signale une ligne de l'app synchronisée puis disparue, sans la supprimer", () => {
    const r = row();
    const rec = reconcile([r], [], LATER);
    expect(rec.toError).toEqual([r.id]);
    expect(rec.toRemove).toEqual([]);
  });

  it('ne touche pas une ligne non synchronisée ni une ligne modifiée pendant la lecture', () => {
    expect(reconcile([row({ syncStatus: 'pending', intervalsId: null })], [], LATER).toError).toEqual([]);
    expect(reconcile([row({ syncStatus: 'error', intervalsId: '900' })], [], LATER).toError).toEqual([]);
    const recent = row({ updatedAt: '2026-12-31T00:00:01.000Z' });
    expect(reconcile([recent], [], LATER)).toEqual({ toInsert: [], toRemove: [], toError: [] });
  });

  it('ne réimporte pas un événement déjà lié à une ligne', () => {
    expect(reconcile([row()], [ev()], LATER).toInsert).toEqual([]);
  });
});

describe('dayStatus', () => {
  it('classe la journée', () => {
    expect(dayStatus({ planned: 1, plannedDone: 1, activities: 1, past: true })).toBe('done');
    expect(dayStatus({ planned: 1, plannedDone: 0, activities: 0, past: true })).toBe('missed');
    expect(dayStatus({ planned: 1, plannedDone: 0, activities: 0, past: false })).toBe('planned');
    expect(dayStatus({ planned: 0, plannedDone: 0, activities: 1, past: true })).toBe('extra');
    expect(dayStatus({ planned: 0, plannedDone: 0, activities: 0, past: true })).toBe('rest');
  });
});

describe('parisToday', () => {
  it('donne la date du jour à Paris au format AAAA-MM-JJ', () => {
    // 23 h UTC le 31 décembre = déjà le 1er janvier à Paris.
    expect(parisToday(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(parisToday(new Date('2026-06-10T12:00:00Z'))).toBe('2026-06-10');
  });
});

describe('validateGoalInput', () => {
  it('exige un titre à la création, pas à la modification', () => {
    expect(() => validateGoalInput({})).toThrow('title requis');
    expect(validateGoalInput({ note: 'ok' }, true)).toEqual({ note: 'ok' });
  });

  it('valide la métrique, la valeur cible (arrondie au dixième) et les dates', () => {
    expect(validateGoalInput({ title: 'FTP', metric: 'ftp', targetValue: '280.26' })).toMatchObject({ metric: 'ftp', targetValue: 280.3, dueDay: null });
    expect(() => validateGoalInput({ title: 'X', metric: 'poids' })).toThrow('métrique invalide');
    expect(() => validateGoalInput({ title: 'X', targetValue: -1 })).toThrow('valeur cible invalide');
    expect(() => validateGoalInput({ title: 'X', dueDay: '2026-13' })).toThrow('dueDay invalide');
  });
});
