import { Cell, Page, Placeholder } from '@/components/ios';
import { useProfileTarget } from '@/hooks/useProfileTarget';

/** Page « Santé et matériel » de la fiche profil — À IMPLÉMENTER PAR A2 (voir docs/plans). */
export default function HealthPage() {
  const { base } = useProfileTarget();
  return (
    <Page title="Santé et matériel" back={{ to: base, label: 'Profil' }}>
      <Placeholder title="Bientôt disponible">Cette partie du profil arrive.</Placeholder>
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : matériel (capteur, ceinture, home trainer, piscine). */
export function EquipmentRow({ base }: RowProps) {
  return <Cell title="Matériel" to={`${base}/sante`} chevron />;
}

/** Ligne de la fiche : santé (limitations en cours). */
export function HealthRow({ base }: RowProps) {
  return <Cell title="Santé" to={`${base}/sante`} chevron />;
}
