import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { renderPage } from '@/hooks/test-utils';
import type { AppEvent } from '@/services/calendarApi';
import { RestCard } from './RestDay';
import { NewEventSheet } from './EventSheets';
import { CalendarView } from '@/pages/Calendar';

const { create, calendar } = vi.hoisted(() => ({
  create: vi.fn(async () => ({ event: {} })),
  calendar: { events: [] as AppEvent[] },
}));

vi.mock('@/hooks/useCalendarData', () => ({
  useGoals: () => ({ data: { races: [], goals: [] } }),
  useEventMutations: () => ({
    create: { mutateAsync: create, isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
    resync: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useCoach', () => ({
  useTeam: () => ({ data: { athletes: [{ id: 'a1', name: 'Léa' }] }, isLoading: false, error: null }),
  useCalendar: () => ({ data: { events: calendar.events, activities: [], doneEventIds: [] }, isLoading: false, error: null }),
  useMe: () => ({ data: { id: 'coach-1', name: 'Coach Test', role: 'coach' } }),
  useSavedWorkouts: () => ({ data: { workouts: [] } }),
}));
vi.mock('@/hooks/useCare', () => ({ useCare: () => ({ data: { days: [], exceptions: [] } }) }));

const today = dayjs().format('YYYY-MM-DD');
const rest: AppEvent = { id: 'r1', kind: 'rest', category: 'NOTE', name: 'Repos', description: 'Marche 30 min', start_date_local: `${today}T00:00:00` };

beforeEach(() => {
  create.mockClear();
  calendar.events = [];
});

describe('RestCard', () => {
  it('se modifie quand le coach peut le faire', () => {
    const onEdit = vi.fn();
    renderPage(<RestCard event={rest} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /repos prescrit : marche 30 min/i }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("est en lecture seule sans onEdit (vue de l'athlète)", () => {
    renderPage(<RestCard event={rest} />);
    expect(screen.getByText('Repos prescrit')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('NewEventSheet : prescrire un repos', () => {
  it("ne propose pas le repos à l'athlète", () => {
    renderPage(<NewEventSheet athleteId="a1" weekStart={dayjs()} defaultDay={dayjs()} onClose={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: 'Repos' })).not.toBeInTheDocument();
  });

  it('crée un repos sans nom obligatoire, avec sa consigne', async () => {
    renderPage(<NewEventSheet athleteId="a1" weekStart={dayjs()} defaultDay={dayjs()} onClose={vi.fn()} allowRest />);
    fireEvent.pointerDown(screen.getByRole('tab', { name: 'Repos' }));
    fireEvent.change(screen.getByLabelText('Consigne du repos'), { target: { value: 'Étirements' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({ athleteId: 'a1', body: expect.objectContaining({ kind: 'rest', date: today, description: 'Étirements' }) });
  });
});

describe('CalendarView : repos prescrit dans la semaine', () => {
  it("l'affiche une fois, en repos prescrit et non en note, sans bouton « Ajouter » ce jour-là", () => {
    calendar.events = [rest];
    renderPage(<CalendarView />);
    expect(screen.getByRole('button', { name: /repos prescrit/i })).toBeInTheDocument();
    expect(screen.getAllByText('Repos prescrit')).toHaveLength(1);
    // Pas affiché une deuxième fois comme une note « Repos ».
    expect(screen.queryByText('Repos')).not.toBeInTheDocument();
    // Six jours libres sur sept : le jour de repos n'a pas de bouton « Ajouter ».
    expect(screen.getAllByRole('button', { name: 'Ajouter' })).toHaveLength(6);
  });

  it("le montre en lecture seule à l'athlète", () => {
    calendar.events = [rest];
    renderPage(<CalendarView fixed={{ id: 'a1', title: 'Mon plan' }} />);
    expect(screen.getByText('Repos prescrit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /repos prescrit/i })).not.toBeInTheDocument();
  });
});
