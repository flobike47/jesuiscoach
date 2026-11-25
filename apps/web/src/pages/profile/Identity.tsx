import { useState } from 'react';
import { Page, Placeholder, Section, Segmented } from '@/components/ios';
import { NumberStepper } from '@/components/common/NumberStepper';
import { PageLoader } from '@/components/common/PageLoader';
import { useProfileTarget } from '@/hooks/useProfileTarget';
import { useProfile, useSaveIdentity } from '@/hooks/useProfile';
import { changedOf, LIMITS, maxBirthDate, todayIso } from '@/lib/physio';
import type { IdentityValues } from '@/services/profileApi';
import { CoachNote, SyncNote } from './Physiology';

/** Identité : date de naissance, sexe, taille, poids, FC de repos. Même envoi que la physiologie. */
export { IdentityRow } from './Physiology';
export type { RowProps } from './Physiology';

type SexChoice = 'M' | 'F' | 'none';
const SEX_OPTIONS: Array<{ value: SexChoice; label: string }> = [
  { value: 'M', label: 'Homme' },
  { value: 'F', label: 'Femme' },
  { value: 'none', label: 'Non précisé' },
];

export default function IdentityPage() {
  const { athleteId, base, self } = useProfileTarget();
  const q = useProfile(athleteId);
  const save = useSaveIdentity(athleteId ?? '');
  const [draft, setDraft] = useState<Partial<IdentityValues>>({});

  const data = q.data;
  if (!athleteId || !data) {
    return (
      <Page title="Identité" back={{ to: base, label: 'Profil' }}>
        {q.isError ? <Placeholder title="Fiche indisponible">{(q.error as Error).message}</Placeholder> : <PageLoader />}
      </Page>
    );
  }

  const v = <K extends keyof IdentityValues>(k: K): IdentityValues[K] => (k in draft ? ((draft[k] ?? null) as IdentityValues[K]) : data.identity[k]);
  const set = (patch: Partial<IdentityValues>) => setDraft((d) => ({ ...d, ...patch }));
  const patch = changedOf(draft, data.identity);
  const dirty = Object.keys(patch).length > 0;
  const sexChoice: SexChoice = v('sex') ?? 'none';

  async function onSave() {
    try {
      await save.mutateAsync(patch);
      setDraft({});
    } catch {
      // Message affiché ci-dessous (save.error).
    }
  }

  return (
    <Page
      title="Identité"
      back={{ to: base, label: 'Profil' }}
      actions={
        <button type="button" onClick={onSave} disabled={!dirty || save.isPending} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44, opacity: !dirty || save.isPending ? 0.4 : 1 }}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <CoachNote profile={data} self={self} />
      <Section footer="Ces valeurs sont envoyées à Intervals.icu. Le poids et la FC de repos vont aussi dans la forme du jour d’Intervals.icu.">
        <div className="cell">
          <label htmlFor="identity-birth" style={{ flex: 1 }}>
            Date de naissance
          </label>
          <input
            id="identity-birth"
            type="date"
            value={v('birthDate') ?? ''}
            min={LIMITS.birthMin}
            max={maxBirthDate(todayIso())}
            onChange={(e) => set({ birthDate: e.target.value || null })}
            style={{ fontSize: 16, background: 'transparent', color: 'var(--label)', border: 0 }}
          />
        </div>
        <div className="cell" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: '10px 16px' }}>
          <span>Sexe</span>
          <Segmented<SexChoice> value={sexChoice} options={SEX_OPTIONS} onChange={(c) => set({ sex: c === 'none' ? null : c })} label="Sexe" />
        </div>
        <div className="cell">
          <NumberStepper label="Taille" value={v('heightCm')} onChange={(n) => set({ heightCm: n })} min={LIMITS.heightCm.min} max={LIMITS.heightCm.max} step={LIMITS.heightCm.step} unit="cm" />
        </div>
        <div className="cell">
          <NumberStepper label="Poids" value={v('weightKg')} onChange={(n) => set({ weightKg: n })} min={LIMITS.weightKg.min} max={LIMITS.weightKg.max} step={LIMITS.weightKg.step} unit="kg" />
        </div>
        <div className="cell">
          <NumberStepper label="FC de repos" value={v('restingHr')} onChange={(n) => set({ restingHr: n })} min={LIMITS.restingHr.min} max={LIMITS.restingHr.max} step={LIMITS.restingHr.step} unit="bpm" />
        </div>
      </Section>
      <div style={{ padding: '0 0 16px' }}>
        {save.error && (
          <p role="alert" className="footnote" style={{ padding: '0 16px', color: 'var(--red)' }}>
            {(save.error as Error).message}
          </p>
        )}
        <SyncNote sync={data.sync} />
      </div>
    </Page>
  );
}
