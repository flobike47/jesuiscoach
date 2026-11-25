import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Cell, Page, Placeholder, Section, Segmented, Sheet } from '@/components/ios';
import { NumberStepper } from '@/components/common/NumberStepper';
import { PageLoader } from '@/components/common/PageLoader';
import { useProfileTarget } from '@/hooks/useProfileTarget';
import { useAcceptSuggestion, useAddTest, useDeleteTest, useProfile, useSaveIdentity, useSavePhysiology, useSaveVma, useTests } from '@/hooks/useProfile';
import { useAuth } from '@/lib/auth';
import { ageOf, changedOf, formatDay, formatField, formatNumber, formatPace, HR_PCT, LIMITS, POWER_PCT, todayIso, zonesFrom, type Zone } from '@/lib/physio';
import type { InputKind } from '@/lib/numberInput';
import type { IdentityValues, PhysioValues, ProfileView, Suggestion, SuggestionField, TestKind } from '@/services/profileApi';
import type { Sport } from '@/types';

/**
 * Fiche profil — physiologie. Vélo : FTP, FC seuil, FC max. Course et natation :
 * allure seuil, FC. Commun : poids et FC de repos (route identité). VMA et
 * tests physiques restent dans l'app. L'enregistrement part vers Intervals.icu.
 */

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

const SPORTS: Sport[] = ['Ride', 'Run', 'Swim'];
const SPORT_OPTIONS: Array<{ value: Sport; label: string }> = [
  { value: 'Ride', label: 'Vélo' },
  { value: 'Run', label: 'Course' },
  { value: 'Swim', label: 'Natation' },
];

const FIELD_LABEL: Record<SuggestionField, string> = {
  ftp: 'la FTP',
  lthr: 'la FC seuil',
  maxHr: 'la FC max',
  thresholdSecs: 'l’allure seuil',
  birthDate: 'la date de naissance',
  sex: 'le sexe',
  heightCm: 'la taille',
  weightKg: 'le poids',
  restingHr: 'la FC de repos',
};

const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Ligne d'état de l'envoi vers Intervals.icu, sous la fiche. */
export function SyncNote({ sync, error }: { sync: ProfileView['sync']; error?: string | null }) {
  const auth = useAuth();
  const message = error ?? sync.error;
  return (
    <div style={{ padding: '8px 16px 0' }}>
      <p className="footnote" style={{ margin: 0 }}>
        Envoyé à Intervals.icu, puis à ta montre.
      </p>
      {sync.needsReconnect ? (
        <p className="footnote" style={{ margin: '6px 0 0', color: 'var(--orange)' }}>
          Reconnecte ton compte Intervals.icu pour envoyer ces valeurs.{' '}
          <button type="button" onClick={() => auth.signInWithIntervals()} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
            Reconnecter
          </button>
        </p>
      ) : message ? (
        <p role="alert" className="footnote" style={{ margin: '6px 0 0', color: 'var(--red)' }}>
          {message}
        </p>
      ) : sync.syncedAt ? (
        <p className="footnote" style={{ margin: '6px 0 0' }}>
          Dernier envoi réussi le {dateTime(sync.syncedAt)}.
        </p>
      ) : null}
    </div>
  );
}

/** Bandeau quand le coach a modifié la fiche et que l'athlète la consulte. */
export function CoachNote({ profile, self }: { profile: ProfileView; self: boolean }) {
  if (!self || profile.updatedBy !== 'coach') return null;
  return (
    <p className="footnote" style={{ padding: '0 16px 8px', margin: 0 }}>
      Modifié par ton coach le {dateTime(profile.updatedAt)}.
    </p>
  );
}

/** Bandeau des valeurs proposées par Intervals.icu (ex. nouvelle FTP estimée). */
export function ProfileSuggestions({ athleteId }: { athleteId: string }) {
  const q = useProfile(athleteId);
  const accept = useAcceptSuggestion(athleteId);
  const saveIdentity = useSaveIdentity(athleteId);
  const savePhysio = useSavePhysiology(athleteId);
  const list = q.data?.suggestions ?? [];
  if (list.length === 0) return null;

  const keep = (s: Suggestion) => {
    if (s.sport) savePhysio.mutate({ sport: s.sport, body: { [s.field]: s.appValue } as Partial<PhysioValues> });
    else saveIdentity.mutate({ [s.field]: s.appValue } as Partial<IdentityValues>);
  };

  return (
    <Section header="Intervals.icu propose" footer="Accepter prend la valeur d’Intervals.icu. Garder renvoie la tienne vers Intervals.icu.">
      {list.map((s) => {
        const label = s.field === 'thresholdSecs' ? (s.sport === 'Swim' ? 'l’allure seuil natation' : 'l’allure seuil course') : FIELD_LABEL[s.field];
        const value = formatField(s.field, s.sport, s.intervalsValue);
        const app = formatField(s.field, s.sport, s.appValue);
        return (
          <div key={`${s.sport ?? ''}-${s.field}`} style={{ padding: '12px 16px', display: 'grid', gap: 8, background: 'color-mix(in srgb, var(--orange) 10%, transparent)' }}>
            <p style={{ margin: 0 }}>
              Intervals.icu propose {label} : <strong className="tabular-nums">{value}</strong>
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => accept.mutate(s)} disabled={accept.isPending} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
                Accepter
              </button>
              {s.appValue != null && (
                <button type="button" onClick={() => keep(s)} disabled={savePhysio.isPending || saveIdentity.isPending} style={{ color: 'var(--label-2)', minHeight: 44 }}>
                  Garder {app}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

/** Ligne de la fiche : identité (âge, poids). */
export function IdentityRow({ athleteId, base }: RowProps) {
  const q = useProfile(athleteId);
  const i = q.data?.identity;
  const parts = [i?.birthDate ? `${ageOf(i.birthDate, todayIso())} ans` : null, i?.weightKg != null ? formatField('weightKg', null, i.weightKg) : null].filter(Boolean);
  return <Cell title="Identité" subtitle={parts.length ? parts.join(' · ') : 'À renseigner'} to={`${base}/identite`} chevron />;
}

/** Ligne de la fiche : physiologie (FTP, FC seuil, allure). */
export function PhysiologyRow({ athleteId, base }: RowProps) {
  const q = useProfile(athleteId);
  const p = q.data?.physiology;
  const parts: string[] = [];
  if (p?.Ride.ftp != null) parts.push(`FTP ${p.Ride.ftp} W`);
  if (p?.Ride.lthr != null) parts.push(`FC seuil ${p.Ride.lthr}`);
  if (parts.length === 0 && p?.Run.thresholdSecs != null) parts.push(`Course ${formatPace(p.Run.thresholdSecs, 'Run')}`);
  return <Cell title="Physiologie" subtitle={parts.length ? parts.join(' · ') : 'À renseigner'} to={`${base}/physiologie`} chevron />;
}

/** Plages de zones en texte : « Z1 ≤ 137 · Z2 138–187 · … Z7 ≥ 375 ». */
function zoneText(zones: Zone[], unit: string): string {
  const parts = zones.map((z) =>
    z.from == null ? `Z${z.zone} ≤ ${z.to}` : z.to == null ? `Z${z.zone} ≥ ${z.from}` : `Z${z.zone} ${z.from}–${z.to}`,
  );
  return `${parts.join(' · ')} ${unit}`;
}

type Draft = {
  identity: Partial<IdentityValues>;
  physio: Partial<Record<Sport, Partial<PhysioValues>>>;
  vma?: number | null;
};
const EMPTY_DRAFT: Draft = { identity: {}, physio: {} };

const TEST_META: Record<TestKind, { label: string; applicable: boolean; min: number; max: number; step: number; unit?: string; input: InputKind }> = {
  ftp: { label: 'FTP', applicable: true, min: LIMITS.ftp.min, max: LIMITS.ftp.max, step: 1, unit: 'W', input: 'number' },
  lthr: { label: 'FC seuil', applicable: true, min: LIMITS.lthr.min, max: LIMITS.lthr.max, step: 1, unit: 'bpm', input: 'number' },
  vma: { label: 'VMA', applicable: true, min: LIMITS.vmaKmh.min, max: LIMITS.vmaKmh.max, step: 0.1, unit: 'km/h', input: 'number' },
  run_threshold: { label: 'Allure seuil course', applicable: true, min: LIMITS.runThresholdSecs.min, max: LIMITS.runThresholdSecs.max, step: 5, unit: '/km', input: 'clock' },
  swim_threshold: { label: 'Allure seuil natation', applicable: true, min: LIMITS.swimThresholdSecs.min, max: LIMITS.swimThresholdSecs.max, step: 1, unit: '/100 m', input: 'clock' },
  other: { label: 'Autre', applicable: false, min: 0.1, max: 9999.9, step: 0.1, input: 'number' },
};

function formatTestValue(kind: TestKind, v: number): string {
  switch (kind) {
    case 'ftp':
      return `${formatNumber(v)} W`;
    case 'lthr':
      return `${formatNumber(v)} bpm`;
    case 'vma':
      return `${formatNumber(v)} km/h`;
    case 'run_threshold':
      return formatPace(Math.round(v), 'Run');
    case 'swim_threshold':
      return formatPace(Math.round(v), 'Swim');
    default:
      return formatNumber(v);
  }
}

export default function PhysiologyPage() {
  const { athleteId, base, self } = useProfileTarget();
  const id = athleteId ?? '';
  const q = useProfile(athleteId);
  const tests = useTests(athleteId);
  const saveIdentity = useSaveIdentity(id);
  const savePhysio = useSavePhysiology(id);
  const saveVma = useSaveVma(id);
  const deleteTest = useDeleteTest(id);
  const [sport, setSport] = useState<Sport>('Ride');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [testOpen, setTestOpen] = useState(false);

  const data = q.data;
  if (!athleteId || !data) {
    return (
      <Page title="Physiologie" back={{ to: base, label: 'Profil' }}>
        {q.isError ? <Placeholder title="Fiche indisponible">{(q.error as Error).message}</Placeholder> : <PageLoader />}
      </Page>
    );
  }

  const idVal = <K extends keyof IdentityValues>(k: K): IdentityValues[K] => (k in draft.identity ? ((draft.identity[k] ?? null) as IdentityValues[K]) : data.identity[k]);
  const pVal = (s: Sport, k: keyof PhysioValues): number | null => {
    const d = draft.physio[s];
    return d && k in d ? (d[k] ?? null) : data.physiology[s][k];
  };
  const setId = (patch: Partial<IdentityValues>) => setDraft((d) => ({ ...d, identity: { ...d.identity, ...patch } }));
  const setPhysio = (s: Sport, patch: Partial<PhysioValues>) => setDraft((d) => ({ ...d, physio: { ...d.physio, [s]: { ...d.physio[s], ...patch } } }));

  const idPatch = changedOf(draft.identity, data.identity);
  const physioPatch: Partial<Record<Sport, Partial<PhysioValues>>> = {};
  for (const s of SPORTS) {
    const c = changedOf(draft.physio[s] ?? {}, data.physiology[s]);
    if (Object.keys(c).length > 0) physioPatch[s] = c;
  }
  const vmaChanged = draft.vma !== undefined && draft.vma !== data.vmaKmh;
  const dirty = Object.keys(idPatch).length > 0 || Object.keys(physioPatch).length > 0 || vmaChanged;
  const saving = saveIdentity.isPending || savePhysio.isPending || saveVma.isPending;
  const error = (saveIdentity.error ?? savePhysio.error ?? saveVma.error) as Error | null;

  async function save() {
    try {
      if (Object.keys(idPatch).length > 0) await saveIdentity.mutateAsync(idPatch);
      for (const s of SPORTS) {
        const body = physioPatch[s];
        if (body) await savePhysio.mutateAsync({ sport: s, body });
      }
      if (vmaChanged) await saveVma.mutateAsync(draft.vma ?? null);
      setDraft(EMPTY_DRAFT);
    } catch {
      // Message affiché depuis l'état de la mutation (error).
    }
  }

  const ftp = pVal('Ride', 'ftp');
  const rideLthr = pVal('Ride', 'lthr');
  const powerZones = ftp != null ? zonesFrom(ftp, POWER_PCT) : null;
  const rideHrZones = rideLthr != null ? zonesFrom(rideLthr, HR_PCT) : null;
  const runLthr = pVal('Run', 'lthr');
  const runHrZones = runLthr != null ? zonesFrom(runLthr, HR_PCT) : null;
  const vma = draft.vma !== undefined ? draft.vma : data.vmaKmh;

  return (
    <Page
      title="Physiologie"
      back={{ to: base, label: 'Profil' }}
      actions={
        <button type="button" onClick={save} disabled={!dirty || saving} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44, opacity: !dirty || saving ? 0.4 : 1 }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <CoachNote profile={data} self={self} />
      <div style={{ padding: '4px 16px 16px' }}>
        <Segmented<Sport> value={sport} options={SPORT_OPTIONS} onChange={setSport} label="Sport" />
      </div>

      <Section
        footer={
          <>
            {sport === 'Ride' && powerZones && <span style={{ display: 'block' }}>Puissance : {zoneText(powerZones, 'W')}</span>}
            {sport === 'Ride' && rideHrZones && <span style={{ display: 'block' }}>Cardio : {zoneText(rideHrZones, 'bpm')}</span>}
            {sport === 'Run' && runHrZones && <span style={{ display: 'block' }}>Cardio : {zoneText(runHrZones, 'bpm')}</span>}
          </>
        }
      >
        <div className="cell">
          {sport === 'Ride' && (
            <NumberStepper label="FTP" value={pVal('Ride', 'ftp')} onChange={(v) => setPhysio('Ride', { ftp: v })} min={LIMITS.ftp.min} max={LIMITS.ftp.max} step={LIMITS.ftp.step} unit="W" />
          )}
          {sport === 'Run' && (
            <NumberStepper label="Allure seuil" kind="clock" value={pVal('Run', 'thresholdSecs')} onChange={(v) => setPhysio('Run', { thresholdSecs: v })} min={LIMITS.runThresholdSecs.min} max={LIMITS.runThresholdSecs.max} step={LIMITS.runThresholdSecs.step} unit="/km" />
          )}
          {sport === 'Swim' && (
            <NumberStepper label="Allure seuil" kind="clock" value={pVal('Swim', 'thresholdSecs')} onChange={(v) => setPhysio('Swim', { thresholdSecs: v })} min={LIMITS.swimThresholdSecs.min} max={LIMITS.swimThresholdSecs.max} step={LIMITS.swimThresholdSecs.step} unit="/100 m" />
          )}
        </div>
        {sport !== 'Swim' && (
          <>
            <div className="cell">
              <NumberStepper label="FC seuil" value={pVal(sport, 'lthr')} onChange={(v) => setPhysio(sport, { lthr: v })} min={LIMITS.lthr.min} max={LIMITS.lthr.max} step={LIMITS.lthr.step} unit="bpm" />
            </div>
            <div className="cell">
              <NumberStepper label="FC max" value={pVal(sport, 'maxHr')} onChange={(v) => setPhysio(sport, { maxHr: v })} min={LIMITS.maxHr.min} max={LIMITS.maxHr.max} step={LIMITS.maxHr.step} unit="bpm" />
            </div>
          </>
        )}
      </Section>

      <Section header="Commun à tous les sports" footer="Poids et FC de repos sont aussi enregistrés dans la forme du jour d’Intervals.icu.">
        <div className="cell">
          <NumberStepper label="Poids" value={idVal('weightKg')} onChange={(v) => setId({ weightKg: v })} min={LIMITS.weightKg.min} max={LIMITS.weightKg.max} step={LIMITS.weightKg.step} unit="kg" />
        </div>
        <div className="cell">
          <NumberStepper label="FC de repos" value={idVal('restingHr')} onChange={(v) => setId({ restingHr: v })} min={LIMITS.restingHr.min} max={LIMITS.restingHr.max} step={LIMITS.restingHr.step} unit="bpm" />
        </div>
      </Section>

      <Section header="VMA et tests" footer="La VMA et les tests restent dans l’app : Intervals.icu n’a pas ces champs.">
        <div className="cell">
          <NumberStepper label="VMA" value={vma} onChange={(v) => setDraft((d) => ({ ...d, vma: v }))} min={LIMITS.vmaKmh.min} max={LIMITS.vmaKmh.max} step={LIMITS.vmaKmh.step} unit="km/h" />
        </div>
        {tests.data?.tests.map((t) => (
          <div className="cell" key={t.id}>
            <div className="cell-body">
              <div className="cell-title">
                {TEST_META[t.kind].label} · <span className="tabular-nums">{formatTestValue(t.kind, t.value)}</span>
              </div>
              <div className="cell-subtitle">
                {formatDay(t.day)}
                {t.note ? ` · ${t.note}` : ''}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Supprimer le test du ${formatDay(t.day)}`}
              onClick={() => deleteTest.mutate(t.id)}
              disabled={deleteTest.isPending}
              style={{ width: 44, minHeight: 44, display: 'grid', placeItems: 'center', color: 'var(--red)' }}
            >
              <Trash2 size={18} aria-hidden />
            </button>
          </div>
        ))}
        {tests.data && tests.data.tests.length === 0 && (
          <div className="cell">
            <span className="secondary">Aucun test pour l’instant.</span>
          </div>
        )}
        <Cell title={<span style={{ color: 'var(--tint)' }}>Ajouter un test</span>} onClick={() => setTestOpen(true)} />
      </Section>

      <div style={{ padding: '0 0 16px' }}>
        {error && (
          <p role="alert" className="footnote" style={{ padding: '0 16px', color: 'var(--red)' }}>
            {error.message}
          </p>
        )}
        <SyncNote sync={data.sync} />
      </div>

      {testOpen && <AddTestSheet athleteId={athleteId} onClose={() => setTestOpen(false)} />}
    </Page>
  );
}

function AddTestSheet({ athleteId, onClose }: { athleteId: string; onClose: () => void }) {
  const add = useAddTest(athleteId);
  const [kind, setKind] = useState<TestKind>('ftp');
  const [day, setDay] = useState(todayIso());
  const [value, setValue] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [apply, setApply] = useState(false);
  const meta = TEST_META[kind];

  async function save() {
    if (value == null) return;
    try {
      await add.mutateAsync({ day, kind, value, note: note.trim() || null, apply: apply && meta.applicable });
      onClose();
    } catch {
      // Message affiché ci-dessous (add.error).
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nouveau test"
      action={
        <button type="button" onClick={save} disabled={value == null || add.isPending} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44, opacity: value == null ? 0.4 : 1 }}>
          {add.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="group">
        <div className="cell">
          <label style={{ flex: 1 }}>Date</label>
          <input type="date" aria-label="Date du test" value={day} min={LIMITS.testMin} max={todayIso()} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="cell">
          <label style={{ flex: 1 }} htmlFor="test-kind">
            Type
          </label>
          <select
            id="test-kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as TestKind);
              setValue(null);
              setApply(false);
            }}
            style={{ fontSize: 16, background: 'transparent', color: 'var(--label)', border: 0 }}
          >
            {(Object.keys(TEST_META) as TestKind[]).map((k) => (
              <option key={k} value={k}>
                {TEST_META[k].label}
              </option>
            ))}
          </select>
        </div>
        <div className="cell">
          <NumberStepper label="Valeur" value={value} onChange={setValue} min={meta.min} max={meta.max} step={meta.step} unit={meta.unit} kind={meta.input} />
        </div>
        <div className="cell">
          <input className="field" aria-label="Note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)" />
        </div>
      </div>
      {meta.applicable && (
        <div className="group">
          <label className="cell" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
            <span style={{ flex: 1, marginLeft: 10 }}>Mettre à jour mon profil avec ce résultat</span>
          </label>
        </div>
      )}
      {add.error && (
        <p role="alert" className="footnote" style={{ padding: '0 16px', color: 'var(--red)' }}>
          {(add.error as Error).message}
        </p>
      )}
    </Sheet>
  );
}
