import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkoutComposer } from './WorkoutComposer';

vi.mock('@/hooks/useCoach', () => {
  const mutation = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };
  return {
    useTeam: () => ({
      data: {
        athletes: [
          { id: 'a', name: 'Alex', ftp: 250 },
          { id: 'b', name: 'Bea', ftp: 230 },
        ],
        errors: [],
      },
    }),
    useSaveWorkout: () => mutation,
    useDeleteSavedWorkout: () => mutation,
    useMarkUsed: () => mutation,
  };
});
vi.mock('@/hooks/useCare', () => ({
  useSendWorkout: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWorkoutCheck: () => ({ data: undefined }),
  useDebounced: <T,>(v: T) => v,
  useAssignSuggest: () => ({ data: { suggestions: [] }, isLoading: false }),
}));
vi.mock('@/hooks/useTeamPlanning', () => ({ useGroups: () => ({ data: { groups: [] } }) }));

const draft = { key: 'k', name: 'Nouvelle séance', description: '', sport: 'Ride' as const, quick: true };

describe('WorkoutComposer', () => {
  afterEach(cleanup);
  beforeEach(() => {
    render(<WorkoutComposer draft={draft} onClose={() => {}} />);
  });

  it('lit une ligne, affiche ce qui a été compris et propose le nom', () => {
    fireEvent.change(screen.getByLabelText('Décris-la en une ligne'), { target: { value: '3x12 SS r4' } });
    expect(screen.getByLabelText('Ce qui a été compris')).toHaveTextContent('3× 12 min');
    expect(screen.getByLabelText('Nom de la séance')).toHaveValue('Sweet spot 3×12');
  });

  it('garde le nom retouché à la main', () => {
    fireEvent.change(screen.getByLabelText('Nom de la séance'), { target: { value: 'Mon SST' } });
    fireEvent.change(screen.getByLabelText('Décris-la en une ligne'), { target: { value: '3x12 SS r4' } });
    expect(screen.getByLabelText('Nom de la séance')).toHaveValue('Mon SST');
  });

  it('applique la variante longue (une répétition de plus)', () => {
    fireEvent.change(screen.getByLabelText('Décris-la en une ligne'), { target: { value: '3x12 SS r4' } });
    fireEvent.click(screen.getByRole('radio', { name: /Longue/ }));
    expect(screen.getByRole('radio', { name: /Longue/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Longue/ })).toHaveTextContent('4 répétitions');
  });

  it("passe à l'étape d'attribution puis revient", () => {
    fireEvent.change(screen.getByLabelText('Décris-la en une ligne'), { target: { value: '3x12 SS r4' } });
    fireEvent.click(screen.getByRole('button', { name: /Attribuer/ }));
    // Par défaut : le meilleur jour pour chacun ; « Même jour pour tous » rend le choix de date.
    expect(screen.getByRole('tab', { name: 'Meilleur jour pour chacun' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.pointerDown(screen.getByRole('tab', { name: 'Même jour pour tous' }));
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Séance/ }));
    expect(screen.getByLabelText('Décris-la en une ligne')).toBeInTheDocument();
  });
});

describe('WorkoutComposer ouvert sur l’attribution', () => {
  afterEach(cleanup);

  it('coche d’avance les athlètes reçus (le groupe visé par une suggestion)', () => {
    render(<WorkoutComposer draft={{ key: 's', name: 'Seuil 3×10', description: '- 10m 97%', sport: 'Ride', assign: true, athleteIds: ['b'] }} onClose={() => {}} />);
    fireEvent.pointerDown(screen.getByRole('tab', { name: 'Même jour pour tous' }));
    expect(screen.getByRole('checkbox', { name: 'Bea' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Alex' })).toHaveAttribute('aria-checked', 'false');
  });
});
