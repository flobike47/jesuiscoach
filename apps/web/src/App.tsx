import { useEffect, useSyncExternalStore } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { documentThemeFor, resolveTheme } from './theme';
import { useLocalSettings } from './store/localSettings';
import { AuthProvider } from './lib/auth';
import { applyDocumentTheme } from './lib/documentTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const DARK_QUERY = '(prefers-color-scheme: dark)';
const subscribeDark = (cb: () => void) => {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

export default function App() {
  const mode = useLocalSettings((s) => s.theme);
  const prefersDark = useSyncExternalStore(subscribeDark, () => window.matchMedia(DARK_QUERY).matches);
  const theme = resolveTheme(mode, prefersDark);

  // Variables CSS (data-theme), barre d'état, color-scheme et fond du body.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return applyDocumentTheme(documentThemeFor(theme));
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
