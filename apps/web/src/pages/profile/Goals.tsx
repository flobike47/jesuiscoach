import { Cell, Page, Placeholder } from '@/components/ios';
import { useProfileTarget } from '@/hooks/useProfileTarget';

/** Page « Objectifs et compétitions » de la fiche profil — À IMPLÉMENTER PAR C (voir docs/plans/C-calendrier.md). */
export default function GoalsPage() {
  const { base } = useProfileTarget();
  return (
    <Page title="Objectifs" back={{ to: base, label: 'Profil' }}>
      <Placeholder title="Bientôt disponible">Compétitions et objectifs intermédiaires arrivent.</Placeholder>
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : prochaine compétition, objectifs en cours. */
export function GoalsRow({ base }: RowProps) {
  return <Cell title="Objectifs et compétitions" to={`${base}/objectifs`} chevron />;
}
