/**
 * Utilitaires de test partagés (importés uniquement par les fichiers *.test.tsx).
 * Rend un composant dans les mêmes fournisseurs que l'app : QueryClient + routeur.
 */
import '@testing-library/jest-dom/vitest';
import type { ReactElement } from 'react';
import { afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';

dayjs.locale('fr');

// Sans `globals: true`, Testing Library ne nettoie pas le DOM tout seul
afterEach(() => cleanup());

// jsdom n'implémente pas matchMedia
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

export function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

export function renderWithProviders(ui: ReactElement, client = createTestQueryClient()) {
  const wrap = (node: ReactElement) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;
  const utils = render(wrap(ui));
  return { ...utils, client, rerender: (next: ReactElement) => utils.rerender(wrap(next)) };
}

/** Comme renderWithProviders, dans un routeur mémoire (pages avec liens). */
export function renderPage(ui: ReactElement, path = '/') {
  const client = createTestQueryClient();
  const wrap = (node: ReactElement) => <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>;
  const utils = renderWithProviders(wrap(ui), client);
  return { ...utils, rerender: (next: ReactElement) => utils.rerender(wrap(next)) };
}
