import { AthleteView } from './Athlete';
import { useMe } from '@/hooks/useCoach';
import { PageLoader } from '@/components/common/PageLoader';

/** Onglet « Progrès » de l'athlète : sa propre fiche. */
export default function MyProgress() {
  const me = useMe();
  if (!me.data) return <PageLoader />;
  return <AthleteView id={me.data.athleteId} title="Progrès" />;
}
