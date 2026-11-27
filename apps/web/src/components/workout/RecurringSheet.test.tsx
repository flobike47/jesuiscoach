import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { RecurringSheet } from './RecurringSheet';

const applyWorkouts = vi.fn();
vi.mock('@/services/batchApi', () => ({ batchApi: { applyWorkouts: (body: unknown) => applyWorkouts(body) } }));
vi.mock('@/hooks/useCoach', () => ({
  useTeam: () => ({
    data: {
      athletes: [
        { id: 'iB', name: 'Hugo' },
        { id: 'iC', name: 'Léa' },
      ],
    },
  }),
  useLibrary: () => ({ data: { folders: [] } }),
  useSavedWorkouts: () => ({ data: { workouts: [{ id: 's1', name: 'Sortie club', sport: 'Ride', description: '- 2h 70%' }] } }),
}));

/** La sortie club, tous les mardis, 3 semaines à partir du lundi 30 novembre, pour Hugo et Léa. */
function fillClubRide() {
  fireEvent.click(screen.getByText('Sortie club'));
  fireEvent.click(screen.getByRole('button', { name: 'mardi' }));
  fireEvent.change(screen.getByLabelText('À partir du'), { target: { value: '2026-11-30' } });
  // 8 semaines par défaut → 3.
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Semaines : moins' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Hugo' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Léa' }));
}

describe('RecurringSheet', () => {
  beforeEach(() => {
    applyWorkouts.mockReset().mockResolvedValue({ total: 3, results: [{ id: 'iB', ok: true, created: 3 }, { id: 'iC', ok: true, created: 3 }] });
  });

  it('annonce le nombre de séances à créer avant envoi', () => {
    renderWithProviders(<RecurringSheet onClose={() => {}} />);
    fillClubRide();
    expect(screen.getByRole('status')).toHaveTextContent('3 occurrences × 2 athlètes = 6 séances à créer');
    expect(screen.getByText(/De mar\. 1 déc\. à mar\. 15 déc\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programmer 6 séances' })).toBeEnabled();
  });

  it('envoie toutes les occurrences en un seul appel, sans série', async () => {
    renderWithProviders(<RecurringSheet onClose={() => {}} />);
    fillClubRide();
    fireEvent.click(screen.getByRole('button', { name: 'Programmer 6 séances' }));
    await waitFor(() => expect(applyWorkouts).toHaveBeenCalledTimes(1));
    expect(applyWorkouts).toHaveBeenCalledWith({
      startDate: '2026-11-30',
      athleteIds: ['iB', 'iC'],
      workouts: [1, 8, 15].map((day) => ({ day, name: 'Sortie club', description: '- 2h 70%', sport: 'Ride' })),
    });
    expect(await screen.findByText('6 séances créées.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Séances programmées' })).toBeDisabled();
  });

  it('bloque un envoi au-delà de 120 séances', () => {
    renderWithProviders(<RecurringSheet onClose={() => {}} />);
    fireEvent.click(screen.getByText('Sortie club'));
    for (const day of ['lundi', 'mercredi', 'vendredi']) fireEvent.click(screen.getByRole('button', { name: day }));
    fireEvent.change(screen.getByLabelText('À partir du'), { target: { value: '2026-11-30' } });
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Semaines : plus' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hugo' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Léa' }));
    // 3 jours × 12 semaines = 36 occurrences × 2 athlètes = 72 : passe.
    expect(screen.getByRole('button', { name: 'Programmer 72 séances' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'mardi' }));
    fireEvent.click(screen.getByRole('button', { name: 'jeudi' }));
    // 5 jours × 12 semaines = 60 occurrences : plus de 40 par envoi.
    expect(screen.getByRole('alert')).toHaveTextContent('60 séances : 40 au plus par envoi.');
    expect(screen.getByRole('button', { name: 'Programmer 120 séances' })).toBeDisabled();
  });
});
