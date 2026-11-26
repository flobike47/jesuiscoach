import { Cell, Page, Placeholder } from '@/components/ios';
import { useProfileTarget } from '@/hooks/useProfileTarget';

/** Page « Appareils » de la fiche profil — À IMPLÉMENTER PAR E (voir docs/plans/E-appareils-wahoo.md). */
export default function DevicesPage() {
  const { base } = useProfileTarget();
  return (
    <Page title="Appareils" back={{ to: base, label: 'Profil' }}>
      <Placeholder title="Bientôt disponible">La connexion directe des compteurs arrive.</Placeholder>
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : appareils reliés directement (Wahoo) ou via Intervals.icu. */
export function DevicesRow({ base }: RowProps) {
  return <Cell title="Appareils" to={`${base}/appareils`} chevron />;
}
