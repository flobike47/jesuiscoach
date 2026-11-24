import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import { formatDuration, formatKm, relativeDay, signed } from './format';

dayjs.locale('fr');

describe('format', () => {
  it('formate les durées en h:mm', () => {
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

  it('dit « aujourd’hui » et « hier »', () => {
    const now = dayjs('2026-11-24T18:00:00');
    expect(relativeDay('2026-11-24T08:00:00', now)).toBe("aujourd'hui");
    expect(relativeDay('2026-11-23T21:00:00', now)).toBe('hier');
    expect(relativeDay('2026-11-10T08:00:00', now)).toBe('mar. 10 nov.');
  });
});
