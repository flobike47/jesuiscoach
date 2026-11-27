// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@/services/calendarApi';
import { isPlainNote, isPrescribedRest, prescribedRestDays, restDetail, teamRestAsEvent } from './restDay';

const rest: AppEvent = { id: '9', kind: 'rest', category: 'NOTE', name: 'Repos', start_date_local: '2026-12-02T00:00:00' };
const note: AppEvent = { id: '8', kind: 'note', category: 'NOTE', name: 'Repos', start_date_local: '2026-12-03T00:00:00' };
const workout: AppEvent = { id: '7', kind: 'workout', category: 'WORKOUT', name: 'Seuil', start_date_local: '2026-12-04T00:00:00' };

describe('repos prescrit', () => {
  it('se reconnaît au kind, pas au nom : une note « Repos » reste une note', () => {
    expect(isPrescribedRest(rest)).toBe(true);
    expect(isPrescribedRest(note)).toBe(false);
    expect(isPlainNote(note)).toBe(true);
    expect(isPlainNote(rest)).toBe(false);
    expect(isPlainNote(workout)).toBe(false);
  });

  it('liste les jours de repos prescrit', () => {
    expect([...prescribedRestDays([rest, note, workout])]).toEqual(['2026-12-02']);
  });

  it('met un repos du planning d’équipe sous forme d’événement', () => {
    expect(teamRestAsEvent({ id: 'r1', name: 'Repos', description: 'Étirements' }, '2026-12-05')).toEqual({
      id: 'r1',
      kind: 'rest',
      category: 'NOTE',
      name: 'Repos',
      description: 'Étirements',
      start_date_local: '2026-12-05T00:00:00',
    });
  });

  it.each([
    [{ name: 'Repos', description: 'Marche 30 min' }, 'Marche 30 min'],
    [{ name: 'Repos complet', description: undefined }, 'Repos complet'],
    [{ name: 'Repos', description: '  ' }, null],
  ])('détail de %j → %j', (e, expected) => {
    expect(restDetail(e)).toBe(expected);
  });
});
