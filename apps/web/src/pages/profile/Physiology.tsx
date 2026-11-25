import { Cell, Page, Placeholder } from '@/components/ios';
import { useProfileTarget } from '@/hooks/useProfileTarget';

/** Page « Physiologie » de la fiche profil — À IMPLÉMENTER PAR A1 (voir docs/plans). */
export default function PhysiologyPage() {
  const { base } = useProfileTarget();
  return (
    <Page title="Physiologie" back={{ to: base, label: 'Profil' }}>
      <Placeholder title="Bientôt disponible">Cette partie du profil arrive.</Placeholder>
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : titre + résumé (FTP, FC seuil…). */
export function PhysiologyRow({ base }: RowProps) {
  return <Cell title="Physiologie" to={`${base}/physiologie`} chevron />;
}

/** Bandeau des valeurs proposées par Intervals.icu (ex. nouvelle FTP estimée). */
export function ProfileSuggestions(_props: { athleteId: string }) {
  return null;
}
