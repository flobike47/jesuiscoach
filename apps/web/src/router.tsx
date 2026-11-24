import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/components/common/RequireAuth';
import { RouteError } from '@/components/common/RouteError';
import { PageLoader } from '@/components/common/PageLoader';
import { runtimeConfig } from '@/lib/runtimeConfig';

// React Router veut un basename SANS slash de fin (ex: "/jesuiscoach").
// Cas racine "/" → on passe undefined pour ne pas configurer de basename.
const basename = runtimeConfig.basePath === '/' ? undefined : runtimeConfig.basePath.replace(/\/$/, '');

/** Code-splitting : chaque page est un chunk chargé à la navigation. */
function page(load: () => Promise<{ default: ComponentType }>) {
  return () => load().then((m) => ({ Component: m.default }));
}

export const router = createBrowserRouter(
  [
    {
      path: '/connexion',
      lazy: page(() => import('@/pages/Login')),
      hydrateFallbackElement: <PageLoader />,
      errorElement: <RouteError fullPage />,
    },
    {
      // Retour d'Intervals.icu (OAuth via le BFF) : #token_hash ou #error
      path: '/connexion/retour',
      lazy: page(() => import('@/pages/AuthReturn')),
      hydrateFallbackElement: <PageLoader />,
      errorElement: <RouteError fullPage />,
    },
    {
      path: '/',
      lazy: async () => {
        const { default: AppLayout } = await import('@/components/layout/AppLayout');
        return {
          element: (
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          ),
        };
      },
      hydrateFallbackElement: <PageLoader />,
      errorElement: <RouteError fullPage />,
      children: [
        {
          // Une exception dans une page s'affiche DANS le layout (onglets utilisables).
          errorElement: <RouteError />,
          children: [
            { index: true, lazy: page(() => import('@/pages/Team')) },
            { path: 'athletes/:id', lazy: page(() => import('@/pages/Athlete')) },
            { path: 'activite', lazy: page(() => import('@/pages/Activity')) },
            { path: 'calendrier', lazy: page(() => import('@/pages/Calendar')) },
            { path: 'seances', lazy: page(() => import('@/pages/Workouts')) },
            { path: 'reglages', lazy: page(() => import('@/pages/Settings')) },
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename },
);
