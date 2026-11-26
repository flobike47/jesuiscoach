import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { CheckinCard } from './Today';

vi.mock('@/hooks/useCoach', () => ({
  useSaveCheckin: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

function renderCheckin(props: Parameters<typeof CheckinCard>[0]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CheckinCard {...props} />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('CheckinCard', () => {
  it('ne devrait pas afficher les pastilles d\'effort sans sortie', () => {
    const { container } = renderCheckin({ today: '2024-11-26', saved: null, hasActivity: false });

    // Pas de pastilles 1-10 (cherche les radios)
    expect(screen.queryAllByRole('radio').length).toBe(5); // Juste les 5 visages
    // Pas de section « Effort perçu »
    expect(container.textContent).not.toContain('Effort perçu');
    cleanup();
  });

  it('devrait afficher les pastilles d\'effort avec sortie, aucune sélectionnée par défaut', () => {
    renderCheckin({ today: '2024-11-26', saved: null, hasActivity: true });

    // 5 visages + 10 pastilles = 15 radios
    const radios = screen.queryAllByRole('radio');
    expect(radios.length).toBe(15);

    // Pastilles d'effort (indices 5-14) ne sont pas cochées
    for (let i = 5; i < 15; i++) {
      expect(radios[i].getAttribute('aria-checked')).toBe('false');
    }
    cleanup();
  });

  it('devrait garder la note repliée par défaut', () => {
    const { container } = renderCheckin({ today: '2024-11-26', saved: null, hasActivity: true });

    // Pas de textarea visible
    const textareas = screen.queryAllByPlaceholderText(/Sommeil, douleur/);
    expect(textareas.length).toBe(0);
    // Lien « Ajouter un mot » visible
    expect(container.textContent).toContain('Ajouter un mot');
    cleanup();
  });

  it('devrait afficher la note dépliée si elle existe (non modifiée)', () => {
    renderCheckin({
      today: '2024-11-26',
      saved: { day: '2024-11-26', feeling: 4, rpe: 7, note: 'Super sortie!' },
      hasActivity: true,
    });

    const textarea = screen.getByPlaceholderText(/Sommeil, douleur/) as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    expect(textarea.value).toBe('Super sortie!');
    cleanup();
  });
});
