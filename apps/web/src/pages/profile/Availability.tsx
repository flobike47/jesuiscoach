import { Cell, Page, Placeholder } from '@/components/ios';
import { useProfileTarget } from '@/hooks/useProfileTarget';

/** Page « Disponibilités » de la fiche profil — À IMPLÉMENTER PAR A2 (voir docs/plans). */
export default function AvailabilityPage() {
  const { base } = useProfileTarget();
  return (
    <Page title="Disponibilités" back={{ to: base, label: 'Profil' }}>
      <Placeholder title="Bientôt disponible">Cette partie du profil arrive.</Placeholder>
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : titre + résumé (jours, volume visé). */
export function AvailabilityRow({ base }: RowProps) {
  return <Cell title="Disponibilités" to={`${base}/disponibilites`} chevron />;
}
