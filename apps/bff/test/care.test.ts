import { describe, expect, it } from 'vitest';
import {
  addDays,
  checkWorkout,
  defaultDays,
  formatMinutes,
  isDay,
  isInjuryActive,
  splitInjuries,
  validateAvailability,
  validateEquipment,
  validateException,
  validateInjury,
  validateWorkoutCheck,
  weekdayOf,
  type CareContext,
  type DayAvailability,
  type Injury,
} from '../src/lib/care.js';
import { BadRequest } from '../src/validation.js';

/** Mardi 1er décembre 2026 (weekday 1). */
const TUESDAY = '2026-12-01';

const injury = (over: Partial<Injury> = {}): Injury => ({
  id: 'i1',
  title: 'Tendinite',
  startedOn: '2026-11-20',
  expectedEnd: '2026-12-15',
  endedOn: null,
  avoidSports: ['Run'],
  avoidIntensity: false,
  note: null,
  ...over,
});

/** Semaine type avec les jours surchargés par index (0 = lundi). */
function week(over: Record<number, Partial<DayAvailability>> = {}): DayAvailability[] {
  return defaultDays().map((d) => ({ ...d, ...(over[d.weekday] ?? {}) }));
}

const ctx = (over: Partial<CareContext['state']> & { name?: string } = {}): CareContext => {
  const { name = 'Paul', ...state } = over;
  return {
    name,
    state: { days: defaultDays(), exceptions: [], equipment: { powerMeter: true, hrStrap: false, smartTrainer: false, poolAccess: false }, injuries: [], ...state },
  };
};

const check = (over: Partial<Parameters<typeof checkWorkout>[0]> = {}) => ({
  date: TUESDAY,
  sport: 'Ride' as const,
  durationSec: null,
  usesPower: false,
  highIntensity: false,
  ...over,
});

describe('dates et formats', () => {
  it('valide les dates réelles seulement', () => {
    expect(isDay('2026-12-01')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('01/12/2026')).toBe(false);
  });

  it('calcule le jour de la semaine (0 = lundi) et les décalages', () => {
    expect(weekdayOf(TUESDAY)).toBe(1);
    expect(weekdayOf('2026-12-14')).toBe(0);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('formate les durées', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(90)).toBe('1 h 30');
  });
});

describe('blessures', () => {
  it('est en cours entre le début et la fin annoncée, sans fin réelle', () => {
    const i = injury();
    expect(isInjuryActive(i, '2026-11-20')).toBe(true);
    expect(isInjuryActive(i, '2026-12-15')).toBe(true);
    expect(isInjuryActive(i, '2026-11-19')).toBe(false);
    expect(isInjuryActive(i, '2026-12-16')).toBe(false);
  });

  it('n’est plus en cours une fois guérie, même avant la date annoncée', () => {
    expect(isInjuryActive(injury({ endedOn: '2026-11-28' }), '2026-12-01')).toBe(false);
    expect(isInjuryActive(injury({ endedOn: '2026-12-01' }), '2026-12-01')).toBe(true);
  });

  it('une blessure future n’est pas en cours', () => {
    expect(isInjuryActive(injury({ startedOn: '2026-12-10' }), TUESDAY)).toBe(false);
  });

  it('répartit en « en cours » et « passées »', () => {
    const past = injury({ id: 'p', startedOn: '2026-01-01', expectedEnd: '2026-02-01' });
    const { current, past: old } = splitInjuries([injury(), past], TUESDAY);
    expect(current.map((i) => i.id)).toEqual(['i1']);
    expect(old.map((i) => i.id)).toEqual(['p']);
  });
});

describe('checkWorkout : avertissements', () => {
  it('bloque une course quand la blessure l’interdit, avec la date de fin annoncée', () => {
    const w = checkWorkout(check({ sport: 'Run' }), ctx({ injuries: [injury()] }));
    expect(w).toEqual([
      { kind: 'injury', level: 'block', title: 'Blessure en cours : Tendinite', detail: "Paul : pas de course jusqu'au 15 déc." },
    ]);
  });

  it('ne bloque pas le vélo quand seul la course est interdite', () => {
    expect(checkWorkout(check({ sport: 'Ride' }), ctx({ injuries: [injury()] }))).toEqual([]);
  });

  it('bloque une séance au-dessus du seuil quand la blessure l’interdit', () => {
    const i = injury({ avoidSports: [], avoidIntensity: true });
    expect(checkWorkout(check({ highIntensity: false }), ctx({ injuries: [i] }))).toEqual([]);
    const [w] = checkWorkout(check({ highIntensity: true }), ctx({ injuries: [i] }));
    expect(w).toMatchObject({ kind: 'injury', level: 'block', detail: "Paul : pas d'effort au-dessus du seuil jusqu'au 15 déc." });
  });

  it('ne bloque pas une blessure terminée', () => {
    const i = injury({ endedOn: '2026-11-30' });
    expect(checkWorkout(check({ sport: 'Run' }), ctx({ injuries: [i] }))).toEqual([]);
  });

  it('bloque les jours d’exception, et précise les dates', () => {
    const exceptions = [{ id: 'e1', fromDay: '2026-12-01', toDay: '2026-12-08', note: null }];
    const [w] = checkWorkout(check(), ctx({ exceptions, name: 'Julie' }));
    expect(w).toEqual({ kind: 'exception', level: 'block', title: 'Athlète indisponible', detail: 'Julie est indisponible du 1 déc. au 8 déc.' });
    expect(checkWorkout(check({ date: '2026-12-09' }), ctx({ exceptions }))).toEqual([]);
  });

  it('avertit un jour de repos de la semaine type', () => {
    const [w] = checkWorkout(check({ date: '2026-12-14' }), ctx({ days: week({ 0: { available: false } }), name: 'Julie' }));
    expect(w).toEqual({ kind: 'availability', level: 'warn', title: 'Jour de repos', detail: "Julie ne s'entraîne pas le lundi." });
  });

  it('avertit une séance plus longue que le temps du jour, avec le prochain jour qui convient', () => {
    const days = week({ 1: { maxMinutes: 60 }, 2: { maxMinutes: 60 } });
    const [w] = checkWorkout(check({ durationSec: 90 * 60 }), ctx({ days, name: 'Julie' }));
    expect(w).toEqual({
      kind: 'availability',
      level: 'warn',
      title: 'Temps disponible dépassé',
      detail: "Julie n'a qu'1 h mardi.",
      suggestDate: '2026-12-03',
    });
  });

  it('saute les jours d’exception et de repos pour proposer une date', () => {
    const days = week({ 1: { maxMinutes: 60 }, 2: { available: false }, 3: { maxMinutes: 60 } });
    const exceptions = [{ id: 'e', fromDay: '2026-12-04', toDay: '2026-12-04', note: null }];
    const [w] = checkWorkout(check({ durationSec: 2 * 3600 }), ctx({ days, exceptions }));
    expect(w.suggestDate).toBe('2026-12-05');
  });

  it('ne propose pas de date quand aucun jour de la semaine ne convient', () => {
    const days = defaultDays().map((d) => ({ ...d, maxMinutes: 30 }));
    const [w] = checkWorkout(check({ durationSec: 3600 }), ctx({ days }));
    expect(w.suggestDate).toBeUndefined();
  });

  it('ne compare pas la durée sans durée connue', () => {
    expect(checkWorkout(check({ durationSec: null }), ctx({ days: week({ 1: { maxMinutes: 30 } }) }))).toEqual([]);
  });

  it('signale le vélo avec puissance sans capteur ni home trainer', () => {
    const noPower = ctx({ equipment: { powerMeter: false, hrStrap: true, smartTrainer: false, poolAccess: false }, name: 'Sarah' });
    expect(checkWorkout(check({ usesPower: true }), noPower)).toEqual([
      { kind: 'equipment', level: 'warn', title: 'Matériel', detail: "Sarah n'a pas de capteur de puissance." },
    ]);
    const trainer = ctx({ equipment: { powerMeter: false, hrStrap: false, smartTrainer: true, poolAccess: false } });
    expect(checkWorkout(check({ usesPower: true }), trainer)).toEqual([]);
    expect(checkWorkout(check({ usesPower: false }), noPower)).toEqual([]);
    expect(checkWorkout(check({ usesPower: true, sport: 'Run' }), noPower)).toEqual([]);
  });
});

describe('validation des entrées', () => {
  const validDays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, available: true, maxMinutes: null, slot: 'any', place: 'any' }));

  it('accepte une semaine complète et trie les jours', () => {
    const { days, weeklyMinutes } = validateAvailability({ weeklyMinutes: 480, days: [...validDays].reverse() });
    expect(weeklyMinutes).toBe(480);
    expect(days.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it.each([
    ['moins de 7 jours', { days: validDays.slice(1) }],
    ['un jour en double', { days: [...validDays.slice(1), { ...validDays[0], weekday: 1 }] }],
    ['un temps max sous 10 min', { days: validDays.map((d, i) => (i === 0 ? { ...d, maxMinutes: 5 } : d)) }],
    ['un temps max au-delà de 12 h', { days: validDays.map((d, i) => (i === 0 ? { ...d, maxMinutes: 721 } : d)) }],
    ['un créneau inconnu', { days: validDays.map((d, i) => (i === 0 ? { ...d, slot: 'nuit' } : d)) }],
    ['un lieu inconnu', { days: validDays.map((d, i) => (i === 0 ? { ...d, place: 'piscine' } : d)) }],
    ['un volume hors bornes', { weeklyMinutes: 3001, days: validDays }],
  ])('refuse %s', (_, body) => {
    expect(() => validateAvailability(body)).toThrow(BadRequest);
  });

  it('refuse une exception qui finit avant de commencer et une date impossible', () => {
    expect(() => validateException({ fromDay: '2026-12-10', toDay: '2026-12-09' })).toThrow(BadRequest);
    expect(() => validateException({ fromDay: '2026-02-30', toDay: '2026-03-01' })).toThrow(BadRequest);
    expect(validateException({ fromDay: TUESDAY, toDay: TUESDAY })).toEqual({ fromDay: TUESDAY, toDay: TUESDAY, note: null });
  });

  it('valide une blessure : sports dédoublonnés, sports inconnus refusés, dates cohérentes', () => {
    const ok = validateInjury({ title: 'Genou', startedOn: TUESDAY, avoidSports: ['Run', 'Run'], avoidIntensity: true });
    expect(ok).toMatchObject({ avoidSports: ['Run'], avoidIntensity: true, expectedEnd: null, endedOn: null });
    expect(() => validateInjury({ title: 'Genou', startedOn: TUESDAY, avoidSports: ['Ski'] })).toThrow(BadRequest);
    expect(() => validateInjury({ title: 'Genou', startedOn: TUESDAY, expectedEnd: '2026-11-01' })).toThrow(BadRequest);
    expect(() => validateInjury({ title: '', startedOn: TUESDAY })).toThrow(BadRequest);
  });

  it('valide le matériel : booléens obligatoires', () => {
    expect(() => validateEquipment({ powerMeter: 'oui', hrStrap: false, smartTrainer: false, poolAccess: false })).toThrow(BadRequest);
    expect(validateEquipment({ powerMeter: true, hrStrap: false, smartTrainer: false, poolAccess: true })).toMatchObject({ powerMeter: true, poolAccess: true });
  });

  it('valide les paramètres d’une séance à vérifier', () => {
    expect(validateWorkoutCheck({ date: TUESDAY, sport: 'Run' })).toEqual({ date: TUESDAY, sport: 'Run', durationSec: null, usesPower: false, highIntensity: false });
    expect(() => validateWorkoutCheck({ date: '2026-13-01', sport: 'Ride' })).toThrow(BadRequest);
    expect(() => validateWorkoutCheck({ date: TUESDAY, sport: 'Ski' })).toThrow(BadRequest);
    expect(() => validateWorkoutCheck({ date: TUESDAY, sport: 'Ride', durationSec: -1 })).toThrow(BadRequest);
  });
});

describe('availabilityOf', () => {
  const days = Array.from({ length: 7 }, (_, weekday) => ({ weekday, available: weekday !== 0, maxMinutes: null, slot: 'any' as const, place: 'any' as const }));
  it('lundi sans sortie habituelle → repos', async () => {
    const { availabilityOf } = await import('../src/lib/care.js');
    expect(availabilityOf('2026-11-23', { days, exceptions: [] })).toBe('repos');
    expect(availabilityOf('2026-11-24', { days, exceptions: [] })).toBeNull();
  });
  it('exception → indisponible, bornes incluses', async () => {
    const { availabilityOf } = await import('../src/lib/care.js');
    const exceptions = [{ id: 'x', fromDay: '2026-11-25', toDay: '2026-11-27', note: null }];
    expect(availabilityOf('2026-11-25', { days, exceptions })).toBe('indisponible');
    expect(availabilityOf('2026-11-27', { days, exceptions })).toBe('indisponible');
    expect(availabilityOf('2026-11-28', { days, exceptions })).toBeNull();
  });
});
