import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CalendarView } from './Calendar';

// Mocke les hooks
vi.mock('@/hooks/useCoach', () => ({
  useTeam: () => ({ data: { athletes: [] }, isLoading: false, error: null }),
  useCalendar: () => ({
    data: {
      events: [],
      activities: [],
      doneEventIds: [],
    },
    isLoading: false,
    error: null,
  }),
  useMe: () => ({ id: 'coach-1', name: 'Coach Test' }),
}));

vi.mock('@/hooks/useCare', () => ({
  useCare: () => ({
    data: {
      days: [
        { weekday: 0, available: true }, // lundi
        { weekday: 1, available: true }, // mardi
        { weekday: 2, available: true }, // mercredi
        { weekday: 3, available: true }, // jeudi
        { weekday: 4, available: true }, // vendredi
        { weekday: 5, available: true }, // samedi
        { weekday: 6, available: true }, // dimanche
      ],
      exceptions: [],
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useCalendarData', () => ({
  useEventMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
    resync: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

describe('CalendarView - vue semaine', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('affiche 7 lignes de jour même sans événement', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarView fixed={{ id: 'athlete-1', title: 'Mon Plan' }} account={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Cherche les jours de la semaine (lu, ma, me, je, ve, sa, di)
    const days = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'];
    for (const day of days) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
  });

  it('affiche un bouton Ajouter pour un jour libre sans événement', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarView fixed={{ id: 'athlete-1', title: 'Mon Plan' }} account={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Cherche tous les boutons Ajouter
    const buttons = screen.getAllByRole('button', { name: /Ajouter/i });
    // Il devrait y avoir au moins un bouton "Ajouter" pour un jour sans événement
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('affiche la charge de la semaine', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarView fixed={{ id: 'athlete-1', title: 'Mon Plan' }} account={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const chargeElements = screen.getAllByText('Charge de la semaine');
    expect(chargeElements.length).toBeGreaterThan(0);
  });
});
