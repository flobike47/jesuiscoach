import { Page, Section } from '@/components/ios';
import { useProfileTarget } from '@/hooks/useProfileTarget';
import { IdentityRow } from './Identity';
import { PhysiologyRow, ProfileSuggestions } from './Physiology';
import { AvailabilityRow } from './Availability';
import { EquipmentRow, HealthRow } from './Health';
import { GoalsRow } from './Goals';

/**
 * Fiche profil de l'athlète (A1 : identité et physiologie ; A2 :
 * disponibilités, matériel, santé). L'athlète la remplit, son coach la
 * consulte et peut la modifier. Les valeurs physiologiques partent vers
 * Intervals.icu (puis la montre) ; le reste ne quitte pas l'app.
 */
export default function Profile() {
  const { athleteId, base, self, back } = useProfileTarget();
  return (
    <Page title={self ? 'Mon profil' : 'Profil'} back={back}>
      {athleteId && <ProfileSuggestions athleteId={athleteId} />}
      <Section>
        <IdentityRow athleteId={athleteId} base={base} />
        <PhysiologyRow athleteId={athleteId} base={base} />
        <GoalsRow athleteId={athleteId} base={base} />
      </Section>
      <Section footer={self ? 'Visible par toi et ton coach.' : 'Visible par l’athlète et toi. Tes modifications lui sont signalées.'}>
        <AvailabilityRow athleteId={athleteId} base={base} />
        <EquipmentRow athleteId={athleteId} base={base} />
        <HealthRow athleteId={athleteId} base={base} />
      </Section>
    </Page>
  );
}
