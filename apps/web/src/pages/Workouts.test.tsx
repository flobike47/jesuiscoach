import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import Workouts from './Workouts';

// Deux athlètes du groupe « Route », sans aucune séance de qualité sur les 20 jours lus.
const calendar = vi.hoisted(() => ({ athletes: [] as unknown[] }));
calendar.athletes = ['a', 'b'].map((id) => ({
  id,
  name: id,
  ftp: 250,
  form: 0,
  groupIds: ['r'],
  error: null,
  load: { planned: 0, done: 0, usual: null },
  days: Array.from({ length: 20 }, (_, i) => ({
    date: dayjs().subtract(13, 'day').add(i, 'day').format('YYYY-MM-DD'),
    availability: null,
    races: [],
    activities: [],
    workouts: [],
  })),
}));

vi.mock('@/hooks/useCoach', () => ({
  useMe: () => ({ data: { role: 'coach', name: 'Coach' } }),
  useLibrary: () => ({ data: { folders: [] }, isError: false }),
  usePlans: () => ({ data: { plans: [] } }),
  useSavedWorkouts: () => ({ data: { workouts: [] } }),
  useToggleFavorite: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useTeamPlanning', () => ({
  useTeamCalendar: () => ({ data: { athletes: calendar.athletes } }),
  useGroups: () => ({ data: { groups: [{ id: 'r', name: 'Route', athleteIds: ['a', 'b'] }] } }),
}));
// La feuille de création est testée à part : on ne regarde ici que ce qu'elle reçoit.
vi.mock('@/components/workout/WorkoutComposer', () => ({
  WorkoutComposer: ({ draft }: { draft: { name: string; assign?: boolean; athleteIds?: string[]; description: string } }) => (
    <div role="dialog" aria-label={draft.name}>
      {draft.assign ? 'attribuer' : 'séance'} · {(draft.athleteIds ?? []).join(',')} · {draft.description}
    </div>
  ),
}));
vi.mock('@/components/workout/FromActivitySheet', () => ({
  FromActivitySheet: ({ onPick }: { onPick: (d: { name: string; description: string }) => void }) => (
    <button type="button" onClick={() => onPick({ name: 'Seuil du mardi (reprise)', description: '- 12m 92%' })}>
      choisir la sortie
    </button>
  ),
}));

afterEach(cleanup);

const renderPage = () =>
  render(
    <MemoryRouter>
      <Workouts />
    </MemoryRouter>,
  );

describe('Workouts', () => {
  it('suggère la qualité délaissée et ouvre l’attribution avec le groupe déjà coché', () => {
    renderPage();
    const message = screen.getByText(/^Le groupe Route n’a pas fait de séance de seuil depuis plus de \d+ jours\.$/);
    // Chaque ligne de la bibliothèque a aussi son action « Planifier » : on vise celle de la carte suggérée.
    fireEvent.click(within(message.closest('.card') as HTMLElement).getByRole('button', { name: 'Planifier' }));
    expect(screen.getByRole('dialog', { name: 'Seuil 3×10' })).toHaveTextContent('attribuer · a,b ·');
  });

  it('« D’une sortie » ouvre la séance reprise dans la feuille de création', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /D’une sortie/ }));
    fireEvent.click(screen.getByRole('button', { name: 'choisir la sortie' }));
    expect(screen.getByRole('dialog', { name: 'Seuil du mardi (reprise)' })).toHaveTextContent('séance · · - 12m 92%');
  });
});
