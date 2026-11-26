import { Page, Placeholder } from '@/components/ios';

/** Vue « Aujourd'hui » du coach : séances prévues et faites de toute l'équipe — À IMPLÉMENTER PAR C. */
export default function TeamToday() {
  return (
    <Page title="Aujourd’hui" back={{ to: '/', label: 'Équipe' }}>
      <Placeholder title="Bientôt disponible">La journée de toute l’équipe arrive.</Placeholder>
    </Page>
  );
}
