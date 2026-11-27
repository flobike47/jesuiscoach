import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SmartAssign } from './SmartAssign';
import type { AthleteSummary } from '@/types';

// Mock les hooks
vi.mock('@/hooks/useCare', () => ({
  useAssignSuggest: () => ({
    data: {
      suggestions: [
        {
          athleteId: 'a1',
          name: 'Alice',
          date: '2026-11-30',
          variant: 'standard',
          intensityScale: 1,
          reasons: ['Frais · mercredi libre 1 h 30'],
          alternatives: ['2026-12-01', '2026-12-02'],
          replaces: null,
          blocked: null,
        } as unknown,
        {
          athleteId: 'a2',
          name: 'Bob',
          date: null,
          variant: 'standard',
          intensityScale: 1,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: 'Blessure en cours',
        } as unknown,
      ],
    },
    isLoading: false,
  }),
  useSendWorkout: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTeamPlanning', () => ({
  useGroups: () => ({
    data: { groups: [] },
  }),
}));

describe('SmartAssign', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  it('affiche une ligne par suggestion avec sa raison', () => {
    const athletes: AthleteSummary[] = [
      { id: 'a1', name: 'Alice', ftp: 250, fitness: 0, fatigue: 0, form: 10, ramp: null, weekLoad: 0, weekHours: 0, weekKm: 0, lastRide: null, daysSinceRide: null, plannedDone: 0, plannedTotal: 0, alerts: [] },
      { id: 'a2', name: 'Bob', ftp: 240, fitness: 0, fatigue: 0, form: 5, ramp: null, weekLoad: 0, weekHours: 0, weekKm: 0, lastRide: null, daysSinceRide: null, plannedDone: 0, plannedTotal: 0, alerts: [] },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <SmartAssign
          baseDescription="- 20m 95%"
          sport="Ride"
          athletes={athletes}
          selected={new Set(['a1', 'a2'])}
          onSelected={vi.fn()}
          onSend={vi.fn()}
          isPending={false}
        />
      </QueryClientProvider>,
    );

    // Affiche les suggestions avec leurs raisons
    expect(screen.getByText(/Frais/)).toBeInTheDocument();
    expect(screen.getByText('Blessure en cours')).toBeInTheDocument();
  });

  it('toucher une ligne déplie les alternatives', () => {
    const athletes: AthleteSummary[] = [
      { id: 'a1', name: 'Alice', ftp: 250, fitness: 0, fatigue: 0, form: 10, ramp: null, weekLoad: 0, weekHours: 0, weekKm: 0, lastRide: null, daysSinceRide: null, plannedDone: 0, plannedTotal: 0, alerts: [] },
      { id: 'a2', name: 'Bob', ftp: 240, fitness: 0, fatigue: 0, form: 5, ramp: null, weekLoad: 0, weekHours: 0, weekKm: 0, lastRide: null, daysSinceRide: null, plannedDone: 0, plannedTotal: 0, alerts: [] },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <SmartAssign
          baseDescription="- 20m 95%"
          sport="Ride"
          athletes={athletes}
          selected={new Set(['a1', 'a2'])}
          onSelected={vi.fn()}
          onSend={vi.fn()}
          isPending={false}
        />
      </QueryClientProvider>,
    );

    // Au départ, « Ne pas planifier » n'est pas visible
    expect(screen.queryByText('Ne pas planifier')).not.toBeInTheDocument();

    // Clique sur la première ligne (Alice)
    const rows = screen.getAllByRole('button', { name: /Alice/ });
    if (rows.length > 0) fireEvent.click(rows[0]);

    // Les alternatives et « Ne pas planifier » apparaissent
    expect(screen.getByText('Ne pas planifier')).toBeInTheDocument();
  });

  it('le bouton indique « Planifier N séances » en excluant les date: null', () => {
    const athletes: AthleteSummary[] = [
      { id: 'a1', name: 'Alice', ftp: 250, fitness: 0, fatigue: 0, form: 10, ramp: null, weekLoad: 0, weekHours: 0, weekKm: 0, lastRide: null, daysSinceRide: null, plannedDone: 0, plannedTotal: 0, alerts: [] },
      { id: 'a2', name: 'Bob', ftp: 240, fitness: 0, fatigue: 0, form: 5, ramp: null, weekLoad: 0, weekHours: 0, weekKm: 0, lastRide: null, daysSinceRide: null, plannedDone: 0, plannedTotal: 0, alerts: [] },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <SmartAssign
          baseDescription="- 20m 95%"
          sport="Ride"
          athletes={athletes}
          selected={new Set(['a1', 'a2'])}
          onSelected={vi.fn()}
          onSend={vi.fn()}
          isPending={false}
        />
      </QueryClientProvider>,
    );

    // Le bouton doit dire « Planifier 1 séance » (Alice seulement, pas Bob qui a date: null)
    // Prends le dernier bouton avec ce texte (c'est le bouton Planifier)
    const buttons = screen.getAllByText(/Planifier 1 séance/);
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[buttons.length - 1]).toBeInTheDocument();
  });
});
