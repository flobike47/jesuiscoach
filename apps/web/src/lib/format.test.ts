import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import { formatDuration, formatKm, relativeDay, signed, formatLoad, formatIntensity, dayShort } from './format';

dayjs.locale('fr');

describe('format', () => {
  it('formate les durees en h:mm', () => {
    expect(formatDuration(5520)).toBe('1:32');
    expect(formatDuration(3599)).toBe('1:00');
    expect(formatDuration(0)).toBe('–');
  });

  it('formate les distances', () => {
    expect(formatKm(48_400)).toBe('48 km');
    expect(formatKm(null)).toBe('–');
  });

  it('utilise le vrai signe moins', () => {
    expect(signed(-34.2)).toBe('−34');
    expect(signed(12)).toBe('+12');
    expect(signed(0.2)).toBe('0');
  });

  it('dit aujourd\'hui et hier', () => {
    const now = dayjs('2026-11-24T18:00:00');
    expect(relativeDay('2026-11-24T08:00:00', now)).toBe("aujourd'hui");
    expect(relativeDay('2026-11-23T21:00:00', now)).toBe('hier');
    expect(relativeDay('2026-11-10T08:00:00', now)).toBe('mar. 10 nov.');
  });

  it('formate les charges d\'entrainement', () => {
    expect(formatLoad(82.4)).toBe('82');
    expect(formatLoad(129.5)).toBe('130');
    expect(formatLoad(0)).toBe('0');
    expect(formatLoad(null)).toBe('–');
    expect(formatLoad(undefined)).toBe('–');
  });

  it('formate l\'intensite IF en virgule francaise', () => {
    expect(formatIntensity(0.83)).toBe('0,83');
    expect(formatIntensity(1.0)).toBe('1,00');
    expect(formatIntensity(0)).toBe('0,00');
    expect(formatIntensity(null)).toBe('–');
    expect(formatIntensity(undefined)).toBe('–');
  });

  it('formate les jours courts (lu a di)', () => {
    expect(dayShort('2026-11-23')).toBe('lu');
    expect(dayShort('2026-11-24')).toBe('ma');
    expect(dayShort('2026-11-25')).toBe('me');
    expect(dayShort('2026-11-26')).toBe('je');
    expect(dayShort('2026-11-27')).toBe('ve');
    expect(dayShort('2026-11-28')).toBe('sa');
    expect(dayShort('2026-11-29')).toBe('di');
  });
});
