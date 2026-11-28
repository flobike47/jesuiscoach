import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import { CalendarView } from './Calendar';

/**
 * Vue semaine : chaque séance, compétition et note s'ouvre (donc se supprime) ;
 * une séance faite mène à sa sortie ; une sortie non appariée reste visible en « hors plan ».
 */

const TODAY = dayjs().format('YYYY-MM-DD');

// Fonction simple (pas un `vi.fn`) : l'espion de Vitest signale la promesse rejetée même interceptée.
const mocks = vi.hoisted(() => ({
  calls: [] as unknown[],
  remove: (async () => ({ ok: true })) as (v: unknown) => Promise<unknown>,
}));

vi.mock('@/hooks/useCoach', () => ({
  useTeam: () => ({ data: { athletes: [] }, isLoading: false, error: null }),
  useCalendar: () => ({
    data: {
      events: [
        { id: 'w1', category: 'WORKOUT', type: 'Ride', name: 'Seuil 3 × 10', start_date_local: `${TODAY}T00:00:00`, description: '- 10m 60%' },
        { id: 'r1', category: 'RACE_A', name: 'Grand Fond', start_date_local: `${TODAY}T00:00:00`, racePriority: 'A' },
        { id: 'n1', category: 'NOTE', name: 'Penser au bidon', start_date_local: `${TODAY}T00:00:00` },
      ],
      activities: [
        { id: 'a1', name: 'Sortie appariée', start_date_local: `${TODAY}T08:00:00`, moving_time: 3600 },
        { id: 'a2', name: 'Balade du soir', start_date_local: `${TODAY}T18:00:00`, moving_time: 1800 },
      ],
      doneEventIds: ['w1'],
      activityByEvent: { w1: 'a1' },
    },
    isLoading: false,
    error: null,
  }),
  useMe: () => ({ data: { role: 'athlete', athleteId: 'athlete-1' } }),
}));

vi.mock('@/hooks/useCare', () => ({ useCare: () => ({ data: undefined, isLoading: false, error: null }) }));

vi.mock('@/hooks/useCalendarData', () => ({
  useGoals: () => ({ data: { races: [], goals: [] } }),
  useEventMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    remove: {
      mutateAsync: (v: unknown) => {
        mocks.calls.push(v);
        return mocks.remove(v);
      },
      isPending: false,
    },
    resync: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

function renderWeek() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/plan']}>
        <CalendarView fixed={{ id: 'athlete-1', title: 'Mon plan' }} account={false} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CalendarView — ouvrir, supprimer, voir la sortie', () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.remove = async () => ({ ok: true });
  });
  afterEach(cleanup);

  it('une séance faite s’ouvre et mène à la sortie qui la réalise', () => {
    renderWeek();
    fireEvent.click(screen.getByRole('button', { name: /Seuil 3 × 10, faite : ouvrir/ }));
    const link = screen.getByRole('link', { name: /Voir la sortie réalisée/ });
    expect(link).toHaveAttribute('href', '/athletes/athlete-1/sorties/a1');
    expect(screen.getByRole('button', { name: 'Supprimer la séance' })).toBeInTheDocument();
  });

  it('affiche en hors plan la sortie non appariée, pas celle de la séance', () => {
    renderWeek();
    expect(screen.getByRole('link', { name: /Balade du soir/ })).toHaveAttribute('href', '/athletes/athlete-1/sorties/a2');
    expect(screen.queryByText('Sortie appariée')).not.toBeInTheDocument();
  });

  it('une compétition s’ouvre sans sport ni structure, et se supprime', () => {
    renderWeek();
    fireEvent.click(screen.getByRole('button', { name: /Grand Fond : ouvrir/ }));
    expect(screen.getByRole('button', { name: 'Supprimer la compétition' })).toBeInTheDocument();
    expect(screen.queryByText('Structure')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Voir la sortie réalisée/ })).not.toBeInTheDocument();
  });

  it('une note s’ouvre et se supprime', async () => {
    renderWeek();
    fireEvent.click(screen.getByRole('button', { name: /Note Penser au bidon : ouvrir/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    await waitFor(() => expect(mocks.calls).toEqual([{ athleteId: 'athlete-1', eventId: 'n1' }]));
  });

  it('un refus d’Intervals.icu s’affiche et la feuille reste ouverte', async () => {
    mocks.remove = async () => {
      throw new Error('Suppression chez Intervals.icu impossible');
    };
    renderWeek();
    fireEvent.click(screen.getByRole('button', { name: /Seuil 3 × 10, faite : ouvrir/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la séance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Suppression chez Intervals.icu impossible');
    // On peut réessayer : le bouton revient à son libellé initial.
    expect(screen.getByRole('button', { name: 'Supprimer la séance' })).toBeInTheDocument();
  });
});
