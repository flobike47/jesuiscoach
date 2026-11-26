import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import { TeamPlanning } from './TeamPlanning';
import { createTestQueryClient } from '@/hooks/test-utils';
import type { Group, TeamCalendarAthlete, TeamCalendarDay } from '@/types';

vi.mock('@/hooks/useTeamPlanning');
vi.mock('@/hooks/useCoach');
vi.mock('@/hooks/useCalendarData');
vi.mock('@/components/calendar/EventSheets', () => ({ EditEventSheet: () => null }));

import * as planning from '@/hooks/useTeamPlanning';
import * as coach from '@/hooks/useCoach';
import * as calendarData from '@/hooks/useCalendarData';

/** Résultat de requête minimal : le composant ne lit que `data`, `isLoading`, `error`. */
const query = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: vi.fn() }) as never;

// Semaine affichée par défaut : celle d'aujourd'hui (lundi → dimanche).
const monday = dayjs().subtract((dayjs().day() + 6) % 7, 'day');
const week = Array.from({ length: 7 }, (_, i) => monday.add(i, 'day').format('YYYY-MM-DD'));
const TUESDAY = monday.add(1, 'day');

function athlete(id: string, name: string, groupIds: string[], withWorkout = false): TeamCalendarAthlete {
  const days: TeamCalendarDay[] = week.map((date, i) => ({
    date,
    availability: null,
    workouts:
      withWorkout && i === 1
        ? [{ id: `w-${id}`, name: 'Tempo', description: '- 60m 85%', sport: 'Ride', load: 72, seconds: 3600, done: false }]
        : [],
    races: [],
    activities: [],
  }));
  return { id, name, ftp: 250, form: -5, groupIds, error: null, days, load: { planned: 72, done: 0, usual: 300 } };
}

const ATHLETES = [athlete('hugo', 'Hugo', ['route'], true), athlete('lea', 'Léa', ['route']), athlete('sarah', 'Sarah', [])];
const GROUPS: Group[] = [{ id: 'route', name: 'Route', athleteIds: ['hugo', 'lea'] }];

const cell = (name: string, day: dayjs.Dayjs) => screen.getByRole('button', { name: new RegExp(`^${name}, ${day.format('dddd D MMMM')}`) });

function renderPlanning() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <TeamPlanning />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TeamPlanning', () => {
  beforeEach(() => {
    vi.mocked(planning.useTeamCalendar).mockReturnValue(query({ from: week[0], to: week[6], athletes: ATHLETES }));
    vi.mocked(planning.useGroups).mockReturnValue(query({ groups: GROUPS }));
    vi.mocked(planning.useGroupMutations).mockReturnValue({ create: { mutateAsync: vi.fn() }, update: { mutateAsync: vi.fn() }, remove: { mutateAsync: vi.fn() } } as never);
    vi.mocked(coach.useTeam).mockReturnValue(query({ athletes: [], errors: [] }));
    vi.mocked(coach.useSavedWorkouts).mockReturnValue(query({ workouts: [] }));
    vi.mocked(calendarData.useEventMutations).mockReturnValue({ create: { mutateAsync: vi.fn() } } as never);
  });

  it('affiche une ligne par athlète', () => {
    renderPlanning();
    for (const name of ['Hugo', 'Léa', 'Sarah']) expect(screen.getByText(name)).toBeInTheDocument();
  });

  it('sélectionne puis désélectionne des cases libres', () => {
    renderPlanning();
    fireEvent.click(cell('Léa', TUESDAY));
    fireEvent.click(cell('Sarah', TUESDAY));
    expect(screen.getByText('2 cases sélectionnées')).toBeInTheDocument();
    expect(cell('Léa', TUESDAY)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(cell('Sarah', TUESDAY));
    expect(screen.getByText(/1 case sélectionnée/)).toBeInTheDocument();
  });

  it("ne sélectionne pas une case occupée par une séance", () => {
    renderPlanning();
    fireEvent.click(cell('Hugo', TUESDAY));
    expect(screen.queryByText(/sélectionnées?/)).not.toBeInTheDocument();
  });

  it('filtre par groupe', () => {
    renderPlanning();
    fireEvent.click(screen.getByRole('button', { name: /^Route/ }));
    expect(screen.getByText('Hugo')).toBeInTheDocument();
    expect(screen.getByText('Léa')).toBeInTheDocument();
    expect(screen.queryByText('Sarah')).not.toBeInTheDocument();
  });
});
