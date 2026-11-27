import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { BlockCopySheet } from './BlockCopySheet';
import type { AthleteSummary } from '@/types';

const applyWorkouts = vi.fn();
vi.mock('@/services/batchApi', () => ({ batchApi: { applyWorkouts: (body: unknown) => applyWorkouts(body) } }));

const ev = (date: string, name: string, category = 'WORKOUT') => ({ id: `${date}-${name}`, category, start_date_local: `${date}T00:00:00`, name, description: '- 1h 70%', type: 'Ride' });
vi.mock('@/hooks/useCoach', () => ({
  useCalendar: () => ({
    isLoading: false,
    error: null,
    data: {
      events: [ev('2026-11-24', 'Seuil'), ev('2026-11-29', 'Longue'), ev('2026-12-02', 'VO2'), ev('2026-12-05', 'Course', 'RACE_A'), ev('2026-12-09', 'Semaine 3')],
      activities: [],
      doneEventIds: [],
    },
  }),
}));

const athletes = [
  { id: 'iB', name: 'Hugo' },
  { id: 'iC', name: 'Léa' },
] as AthleteSummary[];

describe('BlockCopySheet', () => {
  beforeEach(() => {
    applyWorkouts.mockReset().mockResolvedValue({ total: 3, results: [{ id: 'iB', ok: true, created: 3 }, { id: 'iC', ok: true, created: 3 }] });
  });

  it('annonce le nombre de séances à créer avant envoi, puis envoie le bloc décalé en un appel', async () => {
    renderWithProviders(<BlockCopySheet athleteId="iB" monday="2026-11-23" athletes={athletes} onClose={() => {}} />);
    expect(screen.getByText(/3 séances à créer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Léa' }));
    expect(screen.getByText(/6 séances à créer/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Créer 6 séances' }));
    await waitFor(() => expect(applyWorkouts).toHaveBeenCalledTimes(1));
    expect(applyWorkouts).toHaveBeenCalledWith({
      startDate: '2026-12-07',
      athleteIds: ['iB', 'iC'],
      workouts: [
        { day: 1, name: 'Seuil', description: '- 1h 70%', sport: 'Ride' },
        { day: 6, name: 'Longue', description: '- 1h 70%', sport: 'Ride' },
        { day: 9, name: 'VO2', description: '- 1h 70%', sport: 'Ride' },
      ],
    });
  });

  it('refuse de recopier le bloc sur lui-même pour le même athlète', () => {
    renderWithProviders(<BlockCopySheet athleteId="iB" monday="2026-11-23" athletes={athletes} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Semaine d’arrivée'), { target: { value: '2026-12-02' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/en double/);
    expect(screen.getByRole('button', { name: 'Créer 3 séances' })).toBeDisabled();
  });

  it('suit la durée du bloc choisie', () => {
    renderWithProviders(<BlockCopySheet athleteId="iB" monday="2026-11-23" athletes={athletes} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Semaines : plus' }));
    expect(screen.getByText(/4 séances à créer/)).toBeInTheDocument();
  });

  it("affiche l'échec d'un athlète sans fermer la feuille", async () => {
    applyWorkouts.mockResolvedValue({ total: 3, results: [{ id: 'iB', ok: false, created: 1, error: 'Intervals.icu refuse' }] });
    const onClose = vi.fn();
    renderWithProviders(<BlockCopySheet athleteId="iB" monday="2026-11-23" athletes={athletes} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Créer 3 séances' }));
    expect(await screen.findByText(/Hugo : 1\/3 créées \(Intervals.icu refuse\)/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
