import { describe, expect, it } from 'vitest';
import { buildWahooPlan, type PlanThresholds } from '../src/devices/wahooPlan.js';

const RIDE: PlanThresholds = { ftp: 245, lthr: 172, thresholdSpeed: null };
const RUN: PlanThresholds = { ftp: 245, lthr: 170, thresholdSpeed: 3.6 };

const base = { name: 'Seuil 3×10', description: null };

describe('buildWahooPlan (vélo)', () => {
  it('convertit échauffement, répétitions à cadence et retour au calme au format plan.json', () => {
    const r = buildWahooPlan({
      ...base,
      sport: 'Ride',
      text: 'Échauffement\n- 10m ramp 50-75% 90rpm\n\n3x\n- 5m 95-100%\n- 3m 55% 90rpm\n\n- 10m 50%',
      thresholds: RIDE,
    });
    expect(r).toEqual({
      ok: true,
      minutes: 44,
      plan: {
        header: {
          name: 'Seuil 3×10',
          version: '1.0.0',
          description: '',
          workout_type_family: 0,
          workout_type_location: 1,
          ftp: 245,
          threshold_hr: 172,
        },
        intervals: [
          {
            name: 'Échauffement',
            exit_trigger_type: 'time',
            exit_trigger_value: 600,
            intensity_type: 'wu',
            targets: [
              { type: 'ftp', low: 0.5, high: 0.75 },
              { type: 'rpm', low: 90, high: 90 },
            ],
          },
          {
            name: '3 ×',
            exit_trigger_type: 'repeat',
            exit_trigger_value: 2,
            intervals: [
              { name: 'Palier', exit_trigger_type: 'time', exit_trigger_value: 300, intensity_type: 'active', targets: [{ type: 'ftp', low: 0.95, high: 1 }] },
              {
                name: 'Palier',
                exit_trigger_type: 'time',
                exit_trigger_value: 180,
                intensity_type: 'recover',
                targets: [
                  { type: 'ftp', low: 0.55, high: 0.55 },
                  { type: 'rpm', low: 90, high: 90 },
                ],
              },
            ],
          },
          { name: 'Palier', exit_trigger_type: 'time', exit_trigger_value: 600, intensity_type: 'cd', targets: [{ type: 'ftp', low: 0.5, high: 0.5 }] },
        ],
      },
    });
  });

  it('une répétition de 1 fois est dépliée', () => {
    const r = buildWahooPlan({ ...base, sport: 'Ride', text: '1x\n- 10m 70%', thresholds: RIDE });
    expect(r.ok && r.plan.intervals).toEqual([
      { name: 'Palier', exit_trigger_type: 'time', exit_trigger_value: 600, intensity_type: 'active', targets: [{ type: 'ftp', low: 0.7, high: 0.7 }] },
    ]);
  });

  it('une cible au-dessus de 100 % est un intervalle « lt »', () => {
    const r = buildWahooPlan({ ...base, sport: 'Ride', text: '- 5m 120%', thresholds: RIDE });
    expect(r.ok && r.plan.intervals[0].intensity_type).toBe('lt');
  });

  it('une cible en % FC seuil devient threshold_hr', () => {
    const r = buildWahooPlan({ ...base, sport: 'Ride', text: '- 20m 85% LTHR', thresholds: RIDE });
    expect(r.ok && r.plan.intervals[0].targets).toEqual([{ type: 'threshold_hr', low: 0.85, high: 0.85 }]);
  });

  it.each([
    ['un palier en FC max', '- 20m 70% HR', RIDE, 'FC max'],
    ['une ligne en zone', '- 60m Z2', RIDE, 'ligne non prise en charge'],
    ['une cible en watts', '- 10m 200w', RIDE, 'ligne non prise en charge'],
    ['une allure à vélo', '- 10m 90% Pace', RIDE, 'allure'],
    ['une FTP absente', '- 10m 90%', { ftp: null, lthr: 172, thresholdSpeed: null }, 'FTP'],
    ['une séance vide', '', RIDE, 'séance vide'],
  ])('ne convertit pas %s', (_, text, th, reason) => {
    const r = buildWahooPlan({ ...base, sport: 'Ride', text, thresholds: th });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reason);
  });
});

describe('buildWahooPlan (course et natation)', () => {
  it('une allure seuil devient threshold_speed (fraction), une FC seuil threshold_hr', () => {
    const r = buildWahooPlan({
      name: 'Seuil 2×8',
      description: 'Séance test',
      sport: 'Run',
      text: '2x\n- 8m 97-100% Pace\n- 2m 70% Pace\n\n- 10m 75% LTHR',
      thresholds: RUN,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.header).toMatchObject({ workout_type_family: 1, description: 'Séance test', threshold_hr: 170, threshold_speed: 3.6 });
    expect(r.plan.intervals[0]).toMatchObject({ exit_trigger_value: 1, intervals: expect.any(Array) });
    expect(r.plan.intervals[0].intervals?.[0].targets).toEqual([{ type: 'threshold_speed', low: 0.97, high: 1 }]);
    expect(r.plan.intervals[1].targets).toEqual([{ type: 'threshold_hr', low: 0.75, high: 0.75 }]);
  });

  it('une allure seuil absente bloque la conversion', () => {
    const r = buildWahooPlan({ ...base, sport: 'Run', text: '- 8m 97% Pace', thresholds: { ftp: 245, lthr: 170, thresholdSpeed: null } });
    expect(r.ok).toBe(false);
  });

  it('la cadence n’est pas convertie pour la course', () => {
    const r = buildWahooPlan({ ...base, sport: 'Run', text: '- 10m 80% LTHR 90rpm', thresholds: RUN });
    expect(r.ok).toBe(false);
  });

  it('la natation n’est jamais convertie', () => {
    const r = buildWahooPlan({ ...base, sport: 'Swim', text: '- 300mtr 70% Pace', thresholds: RUN });
    expect(r).toEqual({ ok: false, reason: 'natation non prise en charge' });
  });
});
