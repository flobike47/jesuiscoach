import { describe, expect, it } from 'vitest';
import {
  compareWithIntervals,
  intervalsIdentityPatch,
  intervalsSportPatch,
  maxBirthDate,
  parseIdentityPatch,
  parsePhysioPatch,
  parseTest,
  parseVma,
  snapshotOf,
  thresholdPaceOf,
  thresholdSecsOf,
  wellnessPatch,
  type ProfileValues,
} from '../src/lib/profile.js';
import type { IntervalsAthlete } from '../src/types.js';

const TODAY = '2026-11-25';
const empty = (): ProfileValues => ({
  identity: { birthDate: null, sex: null, heightCm: null, weightKg: null, restingHr: null },
  physiology: {
    Ride: { ftp: null, lthr: null, maxHr: null, thresholdSecs: null },
    Run: { ftp: null, lthr: null, maxHr: null, thresholdSecs: null },
    Swim: { ftp: null, lthr: null, maxHr: null, thresholdSecs: null },
  },
});

describe('conversions d’allure seuil', () => {
  it('convertit s/km en m/s et revient à la seconde près', () => {
    expect(thresholdPaceOf('Run', 275)).toBeCloseTo(1000 / 275, 6);
    expect(thresholdSecsOf('Run', thresholdPaceOf('Run', 275))).toBe(275);
  });

  it('convertit s/100 m en m/s : 2:00/100 m = 0,8333 m/s (valeur réelle d’Intervals.icu)', () => {
    expect(thresholdSecsOf('Swim', 0.8333333)).toBe(120);
    expect(thresholdPaceOf('Swim', 120)).toBeCloseTo(0.8333333, 6);
  });

  it.each([60, 120, 240])('aller-retour natation pour %i s/100 m', (secs) => {
    expect(thresholdSecsOf('Swim', thresholdPaceOf('Swim', secs))).toBe(secs);
  });
});

describe('dates de naissance', () => {
  it('admet au plus tard aujourd’hui moins 10 ans, et gère le 29 février', () => {
    expect(maxBirthDate(TODAY)).toBe('2016-11-25');
    expect(maxBirthDate('2028-02-29')).toBe('2018-02-28');
  });
});

describe('snapshotOf : valeurs d’Intervals.icu', () => {
  const info: IntervalsAthlete = {
    id: 'i1',
    icu_weight: 70.25,
    icu_resting_hr: 48,
    sex: 'F',
    height: 168,
    icu_date_of_birth: '1990-05-14T00:00:00',
    sportSettings: [
      { types: ['Ride', 'VirtualRide'], ftp: 245, lthr: 172, max_hr: 190 },
      { types: ['Run'], lthr: 170, max_hr: 188, threshold_pace: 1000 / 275 },
      { types: ['Swim', 'OpenWaterSwim'], threshold_pace: 0.8333333, lthr: 150 },
    ],
  };

  it('lit chaque sport par ses types, et ne prend que les champs applicables', () => {
    const v = snapshotOf(info, TODAY);
    expect(v.physiology.Ride).toEqual({ ftp: 245, lthr: 172, maxHr: 190, thresholdSecs: null });
    expect(v.physiology.Run).toEqual({ ftp: null, lthr: 170, maxHr: 188, thresholdSecs: 275 });
    expect(v.physiology.Swim).toEqual({ ftp: null, lthr: null, maxHr: null, thresholdSecs: 120 });
  });

  it('lit l’identité et ignore les valeurs hors bornes', () => {
    const v = snapshotOf({ ...info, icu_weight: 1, height: 400, icu_resting_hr: 0, icu_date_of_birth: '2020-01-01' }, TODAY);
    expect(v.identity).toEqual({ birthDate: null, sex: 'F', heightCm: null, weightKg: null, restingHr: null });
  });

  it('renvoie des valeurs vides sans groupe de sport', () => {
    expect(snapshotOf({ id: 'i2' }, TODAY).physiology.Run).toEqual(empty().physiology.Run);
  });
});

describe('compareWithIntervals : suggestions', () => {
  it('propose la valeur d’Intervals.icu quand elle diffère de l’app', () => {
    const app = empty();
    app.physiology.Ride.ftp = 230;
    const intervals = empty();
    intervals.physiology.Ride.ftp = 262;
    expect(compareWithIntervals(app, intervals)).toEqual([{ sport: 'Ride', field: 'ftp', appValue: 230, intervalsValue: 262 }]);
  });

  it('ne propose rien quand les valeurs sont égales ou absentes côté Intervals', () => {
    const app = empty();
    app.physiology.Ride.ftp = 245;
    const intervals = empty();
    intervals.physiology.Ride.ftp = 245;
    intervals.identity.weightKg = null;
    expect(compareWithIntervals(app, intervals)).toEqual([]);
  });

  it('propose une valeur quand l’app n’en a pas', () => {
    const app = empty();
    const intervals = empty();
    intervals.identity.restingHr = 52;
    expect(compareWithIntervals(app, intervals)).toEqual([{ sport: null, field: 'restingHr', appValue: null, intervalsValue: 52 }]);
  });

  it('ne compare pas les champs sans sens pour un sport', () => {
    const app = empty();
    const intervals = empty();
    intervals.physiology.Swim.ftp = 300; // n'existe pas pour la natation
    intervals.physiology.Ride.thresholdSecs = 300; // n'existe pas pour le vélo
    expect(compareWithIntervals(app, intervals)).toEqual([]);
  });
});

describe('parseIdentityPatch', () => {
  it('garde les clés présentes et accepte null pour effacer', () => {
    expect(parseIdentityPatch({ weightKg: 70.04, sex: null, extra: 1 }, TODAY)).toEqual({ weightKg: 70, sex: null });
  });

  it.each([
    [{ weightKg: 29.9 }],
    [{ weightKg: 200.1 }],
    [{ heightCm: 119 }],
    [{ heightCm: 170.5 }],
    [{ restingHr: 26.5 }],
    [{ sex: 'X' }],
    [{ birthDate: '2026-02-30' }],
    [{ birthDate: '2016-11-26' }],
    [{ birthDate: '1929-12-31' }],
    [{ weightKg: '70' }],
  ])('refuse %j', (body) => {
    expect(() => parseIdentityPatch(body, TODAY)).toThrow();
  });

  it('refuse un corps qui n’est pas un objet', () => {
    expect(() => parseIdentityPatch(null, TODAY)).toThrow();
    expect(() => parseIdentityPatch([], TODAY)).toThrow();
  });
});

describe('parsePhysioPatch', () => {
  it('refuse la FTP hors vélo et l’allure seuil pour le vélo', () => {
    expect(() => parsePhysioPatch('Run', { ftp: 250 })).toThrow();
    expect(() => parsePhysioPatch('Swim', { ftp: null })).toThrow();
    expect(() => parsePhysioPatch('Ride', { thresholdSecs: 270 })).toThrow();
  });

  it('refuse les champs non applicables (FC seuil natation)', () => {
    expect(() => parsePhysioPatch('Swim', { lthr: 150 })).toThrow();
  });

  it('applique les bornes du sport', () => {
    expect(parsePhysioPatch('Run', { thresholdSecs: 275 })).toEqual({ thresholdSecs: 275 });
    expect(() => parsePhysioPatch('Run', { thresholdSecs: 149 })).toThrow();
    expect(() => parsePhysioPatch('Swim', { thresholdSecs: 241 })).toThrow();
    expect(() => parsePhysioPatch('Ride', { ftp: 49 })).toThrow();
    expect(() => parsePhysioPatch('Ride', { lthr: 221 })).toThrow();
    expect(() => parsePhysioPatch('Ride', { maxHr: 245.5 })).toThrow();
  });

  it('accepte null pour effacer une valeur applicable', () => {
    expect(parsePhysioPatch('Ride', { ftp: null, lthr: 172 })).toEqual({ ftp: null, lthr: 172 });
  });
});

describe('parseVma', () => {
  it.each([
    [{ vmaKmh: 17.25 }, 17.3],
    [{ vmaKmh: null }, null],
  ])('accepte %j', (body, expected) => {
    expect(parseVma(body)).toBe(expected);
  });

  it.each([[{ vmaKmh: 7.9 }], [{ vmaKmh: 25.1 }], [{}]])('refuse %j', (body) => {
    expect(() => parseVma(body)).toThrow();
  });
});

describe('parseTest', () => {
  it('accepte un test et son drapeau apply', () => {
    expect(parseTest({ day: '2026-11-20', kind: 'ftp', value: 251.4, note: '  20 min  ', apply: true }, TODAY)).toEqual({
      test: { day: '2026-11-20', kind: 'ftp', value: 251.4, note: '20 min' },
      apply: true,
    });
  });

  it.each([
    [{ day: '2026-12-01', kind: 'ftp', value: 250 }],
    [{ day: '1999-12-31', kind: 'ftp', value: 250 }],
    [{ day: '2026-11-20', kind: 'nope', value: 250 }],
    [{ day: '2026-11-20', kind: 'ftp', value: 700 }],
    [{ day: '2026-11-20', kind: 'other', value: 10, apply: true }],
    [{ day: '2026-11-20', kind: 'ftp', value: 250, note: 'x'.repeat(301) }],
  ])('refuse %j', (body) => {
    expect(() => parseTest(body, TODAY)).toThrow();
  });
});

describe('patches vers Intervals.icu', () => {
  it('convertit l’allure seuil en m/s et n’envoie que les valeurs renseignées', () => {
    expect(intervalsSportPatch('Run', { thresholdSecs: 275, lthr: null, maxHr: 188 })).toEqual({ max_hr: 188, threshold_pace: thresholdPaceOf('Run', 275) });
    expect(intervalsSportPatch('Ride', { ftp: 250 })).toEqual({ ftp: 250 });
  });

  it('garde les null pour effacer le profil côté Intervals', () => {
    expect(intervalsIdentityPatch({ weightKg: 70, restingHr: null })).toEqual({ icu_weight: 70, icu_resting_hr: null });
  });

  it('pousse le poids et la FC de repos vers la forme du jour, sans les valeurs vides', () => {
    expect(wellnessPatch({ weightKg: 70, restingHr: null })).toEqual({ weight: 70 });
    expect(wellnessPatch({})).toEqual({});
  });
});
