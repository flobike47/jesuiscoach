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
      // Page publique (exigée par Intervals.icu pour l'app OAuth)
      path: '/confidentialite',
      lazy: page(() => import('@/pages/Privacy')),
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
            { index: true, lazy: page(() => import('@/pages/Home')) },
            // Parcours athlète : son calendrier et sa progression
            { path: 'plan', lazy: page(() => import('@/pages/MyPlan')) },
            { path: 'progres', lazy: page(() => import('@/pages/MyProgress')) },
            { path: 'athletes/:id', lazy: page(() => import('@/pages/Athlete')) },
            { path: 'athletes/:id/puissance', lazy: page(() => import('@/pages/AthletePower')) },
            { path: 'athletes/:id/zones', lazy: page(() => import('@/pages/AthleteZones')) },
            { path: 'athletes/:id/sorties/:activityId', lazy: page(() => import('@/pages/ActivityDetail')) },
            { path: 'activite', lazy: page(() => import('@/pages/Activity')) },
            { path: 'calendrier', lazy: page(() => import('@/pages/Calendar')) },
            { path: 'equipe', lazy: page(() => import('@/pages/Team')) },
            // Tendances de l'équipe (P3) : fitness du groupe, sports pratiqués
            { path: 'equipe/tendances', lazy: page(() => import('@/pages/TeamTrends')) },
            { path: 'seances', lazy: page(() => import('@/pages/Workouts')) },
            { path: 'reglages', lazy: page(() => import('@/pages/Settings')) },
            { path: 'bien-demarrer', lazy: page(() => import('@/pages/Welcome')) },
            // Fiche profil (A1 : identité, physiologie ; A2 : disponibilités, santé et matériel)
            { path: 'profil', lazy: page(() => import('@/pages/profile/Profile')) },
            { path: 'profil/identite', lazy: page(() => import('@/pages/profile/Identity')) },
            { path: 'profil/physiologie', lazy: page(() => import('@/pages/profile/Physiology')) },
            { path: 'profil/disponibilites', lazy: page(() => import('@/pages/profile/Availability')) },
            { path: 'profil/sante', lazy: page(() => import('@/pages/profile/Health')) },
            { path: 'profil/objectifs', lazy: page(() => import('@/pages/profile/Goals')) },
            { path: 'profil/appareils', lazy: page(() => import('@/pages/profile/Devices')) },
            { path: 'athletes/:id/profil', lazy: page(() => import('@/pages/profile/Profile')) },
            { path: 'athletes/:id/profil/identite', lazy: page(() => import('@/pages/profile/Identity')) },
            { path: 'athletes/:id/profil/physiologie', lazy: page(() => import('@/pages/profile/Physiology')) },
            { path: 'athletes/:id/profil/disponibilites', lazy: page(() => import('@/pages/profile/Availability')) },
            { path: 'athletes/:id/profil/sante', lazy: page(() => import('@/pages/profile/Health')) },
            { path: 'athletes/:id/profil/objectifs', lazy: page(() => import('@/pages/profile/Goals')) },
            { path: 'athletes/:id/profil/appareils', lazy: page(() => import('@/pages/profile/Devices')) },
            // Phase C : accueil du coach et équipe
            { path: 'aujourdhui', lazy: page(() => import('@/pages/TeamToday')) },
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename },
);
