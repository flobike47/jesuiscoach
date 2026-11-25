import { Cell, Page, Placeholder } from '@/components/ios';
import { useProfileTarget } from '@/hooks/useProfileTarget';

/** Page « Identité » de la fiche profil — À IMPLÉMENTER PAR A1 (voir docs/plans). */
export default function IdentityPage() {
  const { base } = useProfileTarget();
  return (
    <Page title="Identité" back={{ to: base, label: 'Profil' }}>
      <Placeholder title="Bientôt disponible">Cette partie du profil arrive.</Placeholder>
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : titre + résumé (âge, poids…). */
export function IdentityRow({ base }: RowProps) {
  return <Cell title="Identité" to={`${base}/identite`} chevron />;
}
