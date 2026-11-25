import { describe, expect, it } from 'vitest';
import { dayStatus, equipmentSummary, formatDayShort, formatDuration, formatHours, formatLongDate, formatShortDay, isDayOpen, weekSummary, weekdayOf } from './availability';
import type { CareDay, CareEquipment, CareException } from '@/services/careApi';

const day = (weekday: number, over: Partial<CareDay> = {}): CareDay => ({ weekday, available: true, maxMinutes: null, slot: 'any', place: 'any', ...over });
const WEEK = Array.from({ length: 7 }, (_, i) => day(i));

describe('formats', () => {
  it('formate les heures du volume visé', () => {
    expect(formatHours(480)).toBe('8 h');
    expect(formatHours(450)).toBe('7,5 h');
  });

  it('formate les durées', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30');
  });

  it('donne le jour de la semaine et la date courte', () => {
    expect(weekdayOf('2026-12-03')).toBe(3);
    expect(formatShortDay('2026-12-03')).toBe('jeudi 3 déc.');
    expect(formatDayShort('2026-11-20')).toBe('20 nov.');
  });

  it('formate une date longue', () => {
    expect(formatLongDate('2026-11-25T12:00:00Z')).toBe('25 novembre 2026');
  });
});

describe('résumés', () => {
  it('compte les jours disponibles et le volume', () => {
    const days = WEEK.map((d) => (d.weekday >= 5 ? { ...d, available: false } : d));
    expect(weekSummary(days, 480)).toBe('5 jours · 8 h/sem.');
    expect(weekSummary(days, null)).toBe('5 jours');
    expect(weekSummary(WEEK.map((d) => ({ ...d, available: false })), null)).toBe('0 jour');
  });

  it('liste le matériel disponible', () => {
    const eq: CareEquipment = { powerMeter: true, hrStrap: true, smartTrainer: true, poolAccess: false };
    expect(equipmentSummary(eq)).toBe('Capteur, ceinture, HT');
    expect(equipmentSummary({ ...eq, powerMeter: false, hrStrap: false })).toBe('HT');
    expect(equipmentSummary({ powerMeter: false, hrStrap: false, smartTrainer: false, poolAccess: false })).toBe('Rien renseigné');
  });
});

describe('jours grisés au calendrier', () => {
  const exceptions: CareException[] = [{ id: 'e', fromDay: '2026-12-20', toDay: '2026-12-27', note: null }];
  const days = WEEK.map((d) => (d.weekday === 0 ? { ...d, available: false } : d));
  const care = { days, exceptions };

  it('marque le jour de repos de la semaine type', () => {
    expect(dayStatus('2026-12-14', care)).toBe('repos'); // lundi
    expect(dayStatus('2026-12-15', care)).toBeNull(); // mardi
  });

  it("marque les jours d'exception, bornes comprises, et prime sur le repos", () => {
    expect(dayStatus('2026-12-20', care)).toBe('indisponible');
    expect(dayStatus('2026-12-27', care)).toBe('indisponible');
    expect(dayStatus('2026-12-28', care)).toBe('repos'); // lundi
    expect(dayStatus('2026-12-29', care)).toBeNull(); // mardi, après l'exception
    expect(dayStatus('2026-12-21', { days, exceptions })).toBe('indisponible');
  });

  it('indique si une séance peut tomber le jour', () => {
    expect(isDayOpen('2026-12-15', care)).toBe(true);
    expect(isDayOpen('2026-12-14', care)).toBe(false);
  });
});
