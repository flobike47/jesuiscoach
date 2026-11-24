import { describe, expect, it } from 'vitest';
import { computeAlerts, ftpOf, summarize, THRESHOLDS } from '../src/lib/summary.js';

const NOW = new Date('2026-11-24T12:00:00Z');

describe('computeAlerts', () => {
  const ok = { form: 0, ramp: 2, daysSinceRide: 1, plannedDone: 3, plannedTotal: 3 };

  it("ne signale rien quand tout va bien", () => {
    expect(computeAlerts(ok)).toEqual([]);
  });

  it('signale la fatigue sous le seuil de forme', () => {
    expect(computeAlerts({ ...ok, form: THRESHOLDS.formFatigue - 1 }).map((a) => a.code)).toEqual(['fatigue']);
    expect(computeAlerts({ ...ok, form: THRESHOLDS.formFatigue })).toEqual([]);
  });

  it('signale une montée de charge trop rapide', () => {
    expect(computeAlerts({ ...ok, ramp: THRESHOLDS.rampMax + 0.5 })[0]).toMatchObject({ level: 'high', code: 'ramp' });
  });

  it("signale l'inactivité, y compris sans aucune sortie", () => {
    expect(computeAlerts({ ...ok, daysSinceRide: 7 })[0].text).toBe('Aucune sortie depuis 7 jours');
    expect(computeAlerts({ ...ok, daysSinceRide: null })[0].text).toBe('Aucune sortie depuis 4 semaines');
  });

  it('accorde le texte des séances manquées', () => {
    expect(computeAlerts({ ...ok, plannedDone: 2 })[0].text).toBe('1 séance prévue non faite');
    expect(computeAlerts({ ...ok, plannedDone: 0 })[0].text).toBe('3 séances prévues non faites');
  });
});

describe('ftpOf', () => {
  it('prend la FTP vélo des réglages de sport, sinon icu_ftp', () => {
    expect(ftpOf({ id: 'i1', sportSettings: [{ types: ['Run'], ftp: 300 }, { types: ['Ride'], ftp: 250 }] })).toBe(250);
    expect(ftpOf({ id: 'i1', icu_ftp: 240 })).toBe(240);
    expect(ftpOf({ id: 'i1' })).toBeNull();
  });
});

describe('summarize', () => {
  it('calcule forme, volume 7 jours et conformité', () => {
    const s = summarize(
      { id: 'i1', name: 'Julie', icu_ftp: 245 },
      [{ id: '2026-11-23', ctl: 80, atl: 100, rampRate: 9 }, { id: '2026-11-24', ctl: null }],
      [
        { id: 'a1', start_date_local: '2026-11-22T09:00:00', type: 'Ride', moving_time: 7200, distance: 60000, icu_training_load: 100 },
        { id: 'a2', start_date_local: '2026-11-20T09:00:00', type: 'VirtualRide', moving_time: 3600, distance: 30000, icu_training_load: 50 },
        { id: 'a3', start_date_local: '2026-11-21T09:00:00', type: 'Run', moving_time: 3600, icu_training_load: 40 },
        { id: 'a4', start_date_local: '2026-11-01T09:00:00', type: 'Ride', moving_time: 3600, icu_training_load: 70 },
      ],
      [
        { category: 'WORKOUT', start_date_local: '2026-11-22T00:00:00' },
        { category: 'WORKOUT', start_date_local: '2026-11-21T00:00:00' },
        { category: 'NOTE', start_date_local: '2026-11-19T00:00:00' },
        { category: 'WORKOUT', start_date_local: '2026-11-26T00:00:00' },
      ],
      NOW,
    );
    expect(s).toMatchObject({
      name: 'Julie',
      ftp: 245,
      fitness: 80,
      fatigue: 100,
      form: -20,
      ramp: 9,
      weekLoad: 150,
      weekHours: 3,
      weekKm: 90,
      lastRide: '2026-11-22',
      daysSinceRide: 2,
      plannedDone: 1,
      plannedTotal: 2,
    });
    expect(s.alerts.map((a) => a.code)).toEqual(['ramp', 'missed']);
  });
});
