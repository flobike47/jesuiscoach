import { describe, expect, it } from 'vitest';
import { matchPlan } from '../src/lib/plan.js';
import type { IntervalsActivity, IntervalsEvent } from '../src/types.js';

const workout = (id: number, day: string, name = 'Séance'): IntervalsEvent => ({ id, category: 'WORKOUT', start_date_local: `${day}T00:00:00`, name });
const ride = (id: string, day: string, extra: Partial<IntervalsActivity> = {}): IntervalsActivity => ({
  id,
  start_date_local: `${day}T09:00:00`,
  type: 'Ride',
  ...extra,
});

describe('matchPlan', () => {
  it("suit l'appariement d'Intervals.icu, même un autre jour", () => {
    const w = workout(1, '2026-11-20');
    const a = ride('a1', '2026-11-21', { paired_event_id: 1 });
    const m = matchPlan([w], [a]);
    expect(m.activityOf.get(w)).toBe(a);
    expect(m.eventOfActivity.get('a1')).toBe(w);
  });

  it('se replie sur une sortie vélo non appariée du même jour', () => {
    const w = workout(1, '2026-11-20');
    const run = ride('r1', '2026-11-20', { type: 'Run' });
    const a = ride('a1', '2026-11-20');
    expect(matchPlan([w], [run, a]).activityOf.get(w)).toBe(a);
  });

  it("n'utilise pas, en repli, une sortie qu'Intervals.icu a appariée à une autre séance", () => {
    const w1 = workout(1, '2026-11-20');
    const w2 = workout(2, '2026-11-20');
    const a = ride('a1', '2026-11-20', { paired_event_id: 1 });
    const m = matchPlan([w1, w2], [a]);
    expect(m.activityOf.get(w1)).toBe(a);
    expect(m.activityOf.has(w2)).toBe(false);
  });

  it('une sortie ne réalise qu’une séance', () => {
    const w1 = workout(1, '2026-11-20');
    const w2 = workout(2, '2026-11-20');
    const a = ride('a1', '2026-11-20');
    const b = ride('a2', '2026-11-20');
    const m = matchPlan([w1, w2], [a]);
    expect(m.activityOf.size).toBe(1);
    expect(matchPlan([w1, w2], [a, b]).activityOf.size).toBe(2);
  });

  it('ignore les notes et une sortie appariée à une séance hors période', () => {
    const note: IntervalsEvent = { id: 3, category: 'NOTE', start_date_local: '2026-11-20T00:00:00' };
    const a = ride('a1', '2026-11-20', { paired_event_id: 99 });
    const m = matchPlan([note], [a]);
    expect(m.activityOf.size).toBe(0);
    expect(m.eventOfActivity.size).toBe(0);
  });
});
