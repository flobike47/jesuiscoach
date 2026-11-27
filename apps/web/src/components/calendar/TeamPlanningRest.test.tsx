import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { TeamPlanning } from './TeamPlanning';
import { renderPage } from '@/hooks/test-utils';
import type { TeamCalendarAthlete, TeamCalendarDay } from '@/types';

/** Repos prescrit dans le planning d'équipe (mobile) : case distincte, non sélectionnable, prescription groupée. */

vi.mock('@/hooks/useTeamPlanning');
vi.mock('@/hooks/useCoach');
vi.mock('@/hooks/useCalendarData');

import * as planning from '@/hooks/useTeamPlanning';
import * as coach from '@/hooks/useCoach';
import * as calendarData from '@/hooks/useCalendarData';

const query = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: vi.fn() }) as never;

const monday = dayjs().subtract((dayjs().day() + 6) % 7, 'day');
const week = Array.from({ length: 7 }, (_, i) => monday.add(i, 'day').format('YYYY-MM-DD'));
const TUESDAY = monday.add(1, 'day');
const WEDNESDAY = monday.add(2, 'day');

function athlete(id: string, name: string, restOnTuesday = false): TeamCalendarAthlete {
  const days: TeamCalendarDay[] = week.map((date, i) => ({
    date,
    availability: null,
    rest: restOnTuesday && i === 1 ? { id: `r-${id}`, name: 'Repos', description: 'Marche 30 min' } : null,
    workouts: [],
    races: [],
    activities: [],
  }));
  return { id, name, ftp: 250, form: -5, groupIds: [], error: null, days, load: { planned: 0, done: 0, usual: null } };
}

const cell = (name: string, day: dayjs.Dayjs) => screen.getByRole('button', { name: new RegExp(`^${name}, ${day.format('dddd D MMMM')}`) });
const create = vi.fn(async () => ({ event: {} }));

describe('TeamPlanning : repos prescrit', () => {
  beforeEach(() => {
    create.mockClear();
    vi.mocked(planning.useTeamCalendar).mockReturnValue(query({ from: week[0], to: week[6], athletes: [athlete('hugo', 'Hugo', true), athlete('lea', 'Léa')] }));
    vi.mocked(planning.useGroups).mockReturnValue(query({ groups: [] }));
    vi.mocked(planning.useGroupMutations).mockReturnValue({ create: { mutateAsync: vi.fn() }, update: { mutateAsync: vi.fn() }, remove: { mutateAsync: vi.fn() } } as never);
    vi.mocked(coach.useTeam).mockReturnValue(query({ athletes: [], errors: [] }));
    vi.mocked(coach.useSavedWorkouts).mockReturnValue(query({ workouts: [] }));
    vi.mocked(calendarData.useEventMutations).mockReturnValue({
      create: { mutateAsync: create, isPending: false },
      update: { mutateAsync: vi.fn(), isPending: false },
      remove: { mutateAsync: vi.fn(), isPending: false },
    } as never);
  });

  it("annonce la case comme repos prescrit, ne la sélectionne pas et ouvre sa feuille", () => {
    renderPage(<TeamPlanning />);
    const rest = cell('Hugo', TUESDAY);
    expect(rest).toHaveAccessibleName(/repos prescrit$/);
    expect(rest).not.toHaveAttribute('aria-pressed');
    fireEvent.click(rest);
    expect(screen.queryByText(/sélectionnées?/)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Repos prescrit' })).toBeInTheDocument();
    expect(screen.getByLabelText('Consigne du repos')).toHaveValue('Marche 30 min');
  });

  it('ne compte pas le jour de repos dans les cases libres', () => {
    renderPage(<TeamPlanning />);
    // 2 athlètes × 7 jours, moins le repos de Hugo.
    expect(screen.getByText(/13 cases libres/)).toBeInTheDocument();
  });

  it('prescrit un repos sur chaque case sélectionnée', async () => {
    renderPage(<TeamPlanning />);
    fireEvent.click(cell('Léa', TUESDAY));
    fireEvent.click(cell('Hugo', WEDNESDAY));
    fireEvent.click(screen.getByRole('button', { name: 'Repos' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledWith({ athleteId: 'lea', body: { kind: 'rest', date: TUESDAY.format('YYYY-MM-DD'), name: 'Repos' } });
    expect(create).toHaveBeenCalledWith({ athleteId: 'hugo', body: { kind: 'rest', date: WEDNESDAY.format('YYYY-MM-DD'), name: 'Repos' } });
    await waitFor(() => expect(screen.queryByText(/sélectionnées?/)).not.toBeInTheDocument());
  });
});
