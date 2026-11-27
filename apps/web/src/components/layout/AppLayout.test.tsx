import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import AppLayout from './AppLayout';
import { createTestQueryClient } from '@/hooks/test-utils';
import type { Me } from '@/types';
import * as useCoachModule from '@/hooks/useCoach';

// Mock les dépendances qui gêneraient le rendu
vi.mock('@/components/common/IosInstallHint', () => ({
  IosInstallHint: () => null,
}));

vi.mock('@/components/common/UpdateBanner', () => ({
  UpdateBanner: () => null,
}));

vi.mock('@/hooks/useCoach');

function createMeResult(role: 'coach' | 'athlete', name: string): UseQueryResult<Me, Error> {
  const me: Me = { role, name, athleteId: 'test-id', demo: true };
  return {
    data: me,
    isLoading: false,
    isError: false,
    isPending: false,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    isFetching: false,
    failureCount: 0,
    failureReason: null,
    isSuccess: true,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
    remove: vi.fn(),
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isRefetching: false,
    isStale: false,
  } as unknown as UseQueryResult<Me, Error>;
}

describe('AppLayout', () => {
  beforeEach(() => {
    // Réinitialiser les mocks avant chaque test
    vi.clearAllMocks();
    vi.mocked(useCoachModule.useMe).mockReturnValue(createMeResult('coach', 'Coach Démo'));
  });

  it('affiche 4 onglets pour un coach', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>Aujourd'hui</div>} />
              <Route path="/equipe" element={<div>Équipe</div>} />
              <Route path="/calendrier" element={<div>Calendrier</div>} />
              <Route path="/seances" element={<div>Séances</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(4);
    expect(links[0]).toHaveTextContent("Aujourd'hui");
    expect(links[1]).toHaveTextContent('Équipe');
    expect(links[2]).toHaveTextContent('Calendrier');
    expect(links[3]).toHaveTextContent('Séances');
  });

  it('affiche 3 onglets pour un athlète', () => {
    vi.mocked(useCoachModule.useMe).mockReturnValue(createMeResult('athlete', 'Athlète Démo'));

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>Aujourd'hui</div>} />
              <Route path="/plan" element={<div>Plan</div>} />
              <Route path="/progres" element={<div>Progrès</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent("Aujourd'hui");
    expect(links[1]).toHaveTextContent('Plan');
    expect(links[2]).toHaveTextContent('Progrès');
  });

  it('ne montre pas de lien Réglages dans la navigation principale', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>Aujourd'hui</div>} />
              <Route path="/equipe" element={<div>Équipe</div>} />
              <Route path="/calendrier" element={<div>Calendrier</div>} />
              <Route path="/seances" element={<div>Séances</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    const links = within(nav).getAllByRole('link');
    const labels = links.map((link) => link.textContent);

    expect(labels).not.toContain('Réglages');
  });

  it('a une aria-label "Navigation principale" sur la barre de navigation', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>Aujourd'hui</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(nav).toBeTruthy();
  });

  it('affiche un Outlet pour le contenu des routes', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div data-testid="home-content">Contenu Aujourd'hui</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('home-content')).toBeInTheDocument();
  });
});
