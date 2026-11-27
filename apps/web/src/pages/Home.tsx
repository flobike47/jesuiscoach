import { lazy, Suspense } from 'react';
import { useMe } from '@/hooks/useCoach';
import { PageLoader } from '@/components/common/PageLoader';

const CoachToday = lazy(() => import('./CoachToday'));
const Today = lazy(() => import('./Today'));

/** Accueil selon le rôle : aujourd'hui pour le coach, « Aujourd'hui » pour l'athlète. */
export default function Home() {
  const me = useMe();
  if (!me.data) return <PageLoader />;
  return <Suspense fallback={<PageLoader />}>{me.data.role === 'coach' ? <CoachToday /> : <Today />}</Suspense>;
}
