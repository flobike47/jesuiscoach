import { lazy, Suspense } from 'react';
import { useMe } from '@/hooks/useCoach';
import { PageLoader } from '@/components/common/PageLoader';

const Team = lazy(() => import('./Team'));
const Today = lazy(() => import('./Today'));

/** Accueil selon le rôle : l'équipe pour le coach, « Aujourd'hui » pour l'athlète. */
export default function Home() {
  const me = useMe();
  if (!me.data) return <PageLoader />;
  return <Suspense fallback={<PageLoader />}>{me.data.role === 'coach' ? <Team /> : <Today />}</Suspense>;
}
