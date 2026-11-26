import { CalendarView } from './Calendar';
import { useMe } from '@/hooks/useCoach';
import { PageLoader } from '@/components/common/PageLoader';

/** Onglet « Plan » de l'athlète : son propre calendrier. */
export default function MyPlan() {
  const me = useMe();
  if (!me.data) return <PageLoader />;
  return <CalendarView fixed={{ id: me.data.athleteId, title: 'Mon plan' }} account />;
}
