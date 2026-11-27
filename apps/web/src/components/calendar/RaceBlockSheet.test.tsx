import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { RaceBlockSheet } from './RaceBlockSheet';
import { buildBlock } from '@/lib/periodize';
import type { Race } from '@/services/calendarApi';

const create = vi.fn();
const savePlan = vi.fn();

vi.mock('@/hooks/useCare', () => ({
  useCare: () => ({
    data: {
      days: Array.from({ length: 7 }, (_, weekday) => ({ weekday, available: weekday !== 0 && weekday !== 4, maxMinutes: weekday === 2 ? 75 : null, slot: 'any', place: 'any' })),
      exceptions: [],
    },
    isError: false,
  }),
}));
vi.mock('@/hooks/useCalendarData', () => ({ useEventMutations: () => ({ create: { mutateAsync: create } }) }));
vi.mock('@/hooks/useCoach', () => ({ useSavePlan: () => ({ mutateAsync: savePlan }) }));

const TODAY = '2026-11-27';
const race: Race = { id: 'r1', name: 'Grand Fond', date: '2027-01-07', racePriority: 'A', raceDistanceM: 160000, raceGoal: null, syncStatus: 'synced' };
/** Même entrée que la feuille par défaut : 7 → 10 h, SST / seuil / longue, cycle 3. */
const expected = buildBlock({
  today: TODAY,
  raceDate: race.date,
  raceName: race.name,
  sport: 'Ride',
  weeklyHours: { from: 7, to: 10 },
  availableWeekdays: [1, 2, 3, 5, 6],
  maxMinutesByWeekday: { 2: 75 },
  keySessions: ['sweet spot', 'seuil', 'longue'],
  cycle: 3,
});

const proposal = () => screen.getByText(/^Proposition/).nextElementSibling as HTMLElement;

describe('RaceBlockSheet', () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ event: { id: 'e' } });
    savePlan.mockReset().mockResolvedValue({});
    render(<RaceBlockSheet athleteId="a1" race={race} sport="Ride" today={TODAY} onClose={() => {}} />);
  });
  afterEach(cleanup);

  it('affiche une ligne par semaine du bloc', () => {
    expect(screen.getByText(`Proposition · ${expected.totalWorkouts} séances`)).toBeInTheDocument();
    for (const w of expected.weeks) expect(proposal()).toHaveTextContent(dayjs(w.start).format('D MMM'));
  });

  it('recalcule le bloc quand le volume change', () => {
    const before = proposal().textContent;
    fireEvent.click(screen.getByRole('button', { name: 'À : plus' }));
    fireEvent.click(screen.getByRole('button', { name: 'À : plus' }));
    expect(proposal().textContent).not.toBe(before);
  });

  it('garde au moins une séance clé', () => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sweet spot' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seuil' }));
    const last = screen.getByRole('checkbox', { name: 'Sortie longue' });
    expect(last).toBeChecked();
    expect(last).toBeDisabled();
  });

  it('envoie les 2 premières semaines et garde le reste en plan', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer les 2 premières semaines' }));
    const sent = expected.weeks.slice(0, 2).flatMap((w) => w.workouts.filter((x) => x.description));
    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(sent.length);
    expect(create.mock.calls.map(([v]) => v.body.date)).toEqual(sent.map((x) => x.date));
    const plan = savePlan.mock.calls[0][0];
    expect(plan.name).toBe('Grand Fond — suite');
    // Jour 0 = lundi de la 3e semaine : aucune séance avant.
    expect(Math.min(...plan.workouts.map((w: { day: number }) => w.day))).toBeGreaterThanOrEqual(0);
    expect(plan.workouts).toHaveLength(expected.weeks.slice(2).flatMap((w) => w.workouts.filter((x) => x.description)).length);
  });
});
