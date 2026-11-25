import { useState } from 'react';
import dayjs from 'dayjs';
import { Cell, Page, Placeholder, Section, Sheet } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { useProfileTarget } from '@/hooks/useProfileTarget';
import { useCare, useDeleteInjury, useSaveEquipment, useSaveInjury } from '@/hooks/useCare';
import { equipmentSummary, formatDayShort } from '@/lib/availability';
import { SPORT_LABELS, type Sport } from '@/lib/workout';
import type { CareEquipment, CareInjury, CareInjuryInput, CareView } from '@/services/careApi';
import { FieldRow, ToggleSwitch } from './Availability';

const SPORTS: Sport[] = ['Ride', 'Run', 'Swim'];
const EQUIPMENT: Array<{ key: keyof CareEquipment; label: string }> = [
  { key: 'powerMeter', label: 'Capteur de puissance' },
  { key: 'hrStrap', label: 'Ceinture cardio' },
  { key: 'smartTrainer', label: 'Home trainer connecté' },
  { key: 'poolAccess', label: 'Accès piscine' },
];

/** Page « Santé et matériel » : blessures en cours, historique, matériel. */
export default function HealthPage() {
  const { athleteId, base } = useProfileTarget();
  const care = useCare(athleteId);
  return (
    <Page title="Santé et matériel" back={{ to: base, label: 'Profil' }}>
      {care.isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
          <Spinner />
        </div>
      )}
      {care.error && <Placeholder title="Fiche indisponible">{care.error.message}</Placeholder>}
      {care.data && athleteId && <HealthContent athleteId={athleteId} data={care.data} />}
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : matériel (capteur, ceinture, home trainer). */
export function EquipmentRow({ athleteId, base }: RowProps) {
  const care = useCare(athleteId);
  return <Cell title="Matériel" subtitle={care.data ? equipmentSummary(care.data.equipment) : undefined} to={`${base}/sante`} chevron />;
}

/** Ligne de la fiche : santé (limitations en cours, en orange). */
export function HealthRow({ athleteId, base }: RowProps) {
  const care = useCare(athleteId);
  const current = care.data?.injuries.current.length ?? 0;
  const subtitle = care.data ? (
    current ? <span style={{ color: 'var(--orange)' }}>{current} limitation{current > 1 ? 's' : ''} en cours</span> : 'Rien à signaler'
  ) : undefined;
  return <Cell title="Santé" subtitle={subtitle} to={`${base}/sante`} chevron />;
}

function HealthContent({ athleteId, data }: { athleteId: string; data: CareView }) {
  const [editing, setEditing] = useState<CareInjury | 'new' | null>(null);
  const saveEquipment = useSaveEquipment(athleteId);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);

  const toggleEquipment = async (key: keyof CareEquipment, value: boolean) => {
    setEquipmentError(null);
    try {
      await saveEquipment.mutateAsync({ ...data.equipment, [key]: value });
    } catch (e) {
      setEquipmentError((e as Error).message);
    }
  };

  return (
    <>
      <Section header="En cours">
        {data.injuries.current.length === 0 && <Cell title="Rien à signaler" subtitle="Aucune blessure ni limitation en cours." />}
        {data.injuries.current.map((i) => (
          <Cell key={i.id} title={i.title} subtitle={<InjurySummary injury={i} />} onClick={() => setEditing(i)} chevron />
        ))}
        <Cell onClick={() => setEditing('new')} title={<span style={{ color: 'var(--tint)' }}>Signaler une blessure ou une limitation</span>} />
      </Section>

      {data.injuries.past.length > 0 && (
        <Section header="Historique">
          {data.injuries.past.map((i) => (
            <Cell key={i.id} title={i.title} subtitle={<InjurySummary injury={i} />} onClick={() => setEditing(i)} chevron />
          ))}
        </Section>
      )}

      <Section header="Matériel" footer="Le matériel est pris en compte dans les avertissements de ton coach (puissance sans capteur, par exemple).">
        {EQUIPMENT.map(({ key, label }) => (
          <Cell
            key={key}
            title={label}
            detail={<ToggleSwitch label={label} checked={data.equipment[key]} disabled={saveEquipment.isPending} onChange={(v) => toggleEquipment(key, v)} />}
          />
        ))}
        {equipmentError && (
          <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '8px 16px' }}>
            {equipmentError}
          </p>
        )}
      </Section>

      <p className="section-footer" style={{ margin: '4px 20px 0' }}>
        Données de santé : visibles uniquement par toi et ton coach, jamais envoyées à Intervals.icu.
      </p>

      {editing && (
        <InjurySheet
          key={editing === 'new' ? 'new' : editing.id}
          athleteId={athleteId}
          injury={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function InjurySummary({ injury }: { injury: CareInjury }) {
  const avoid = [...injury.avoidSports.map((s) => SPORT_LABELS[s].toLowerCase()), injury.avoidIntensity ? 'efforts au-dessus du seuil' : null].filter(Boolean);
  const dates = [`depuis le ${formatDayShort(injury.startedOn)}`, injury.endedOn ? `guérie le ${formatDayShort(injury.endedOn)}` : injury.expectedEnd ? `jusqu'au ${formatDayShort(injury.expectedEnd)} (estimé)` : null];
  return (
    <>
      <span style={{ display: 'block' }}>{dates.filter(Boolean).join(' · ')}</span>
      <span style={{ display: 'block' }}>{avoid.length ? `À éviter : ${avoid.join(', ')}` : 'Rien d’imposé à l’entraînement'}</span>
      {injury.note && <span style={{ display: 'block' }}>{injury.note}</span>}
    </>
  );
}

/** Signaler ou modifier une blessure. « Marquer guérie » fixe la fin réelle à aujourd'hui. */
function InjurySheet({ athleteId, injury, onClose }: { athleteId: string; injury: CareInjury | null; onClose: () => void }) {
  const [title, setTitle] = useState(injury?.title ?? '');
  const [startedOn, setStartedOn] = useState(injury?.startedOn ?? dayjs().format('YYYY-MM-DD'));
  const [expectedEnd, setExpectedEnd] = useState(injury?.expectedEnd ?? '');
  const [avoidSports, setAvoidSports] = useState<Sport[]>(injury?.avoidSports ?? []);
  const [avoidIntensity, setAvoidIntensity] = useState(injury?.avoidIntensity ?? false);
  const [note, setNote] = useState(injury?.note ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveInjury(athleteId);
  const remove = useDeleteInjury(athleteId);

  const body = (over: Partial<CareInjuryInput> = {}): CareInjuryInput => ({
    title: title.trim(),
    startedOn,
    expectedEnd: expectedEnd || null,
    endedOn: injury?.endedOn ?? null,
    avoidSports,
    avoidIntensity,
    note: note.trim() || null,
    ...over,
  });

  const onSave = async () => {
    setMessage(null);
    if (!title.trim()) return setMessage('Donne un titre (ex. « Tendinite genou »).');
    try {
      await save.mutateAsync({ id: injury?.id, body: body() });
      onClose();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const onHealed = async () => {
    if (!injury) return;
    setMessage(null);
    try {
      await save.mutateAsync({ id: injury.id, body: body({ endedOn: dayjs().format('YYYY-MM-DD') }) });
      onClose();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!injury) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setMessage(null);
    try {
      await remove.mutateAsync(injury.id);
      onClose();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const toggleSport = (s: Sport) => setAvoidSports((all) => (all.includes(s) ? all.filter((x) => x !== s) : [...all, s]));

  return (
    <Sheet
      open
      onClose={onClose}
      title={injury ? 'Blessure' : 'Nouvelle blessure'}
      action={
        <button type="button" onClick={onSave} disabled={save.isPending} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="group">
        <FieldRow label="Titre">
          <input className="field" aria-label="Titre" value={title} maxLength={120} placeholder="Tendinite genou" onChange={(e) => setTitle(e.target.value)} />
        </FieldRow>
        <FieldRow label="Début">
          <input type="date" className="field" aria-label="Début" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </FieldRow>
        <FieldRow label="Fin estimée">
          <input type="date" className="field" aria-label="Fin estimée" value={expectedEnd} onChange={(e) => setExpectedEnd(e.target.value)} />
        </FieldRow>
      </div>

      <h3 className="section-header">À éviter</h3>
      <div className="group" style={{ padding: 12, display: 'grid', gap: 10 }}>
        <div role="group" aria-label="Sports à éviter" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SPORTS.map((s) => {
            const on = avoidSports.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSport(s)}
                style={{
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 22,
                  background: on ? 'var(--tint)' : 'var(--fill)',
                  color: on ? '#fff' : 'var(--label)',
                  fontWeight: 600,
                }}
              >
                {SPORT_LABELS[s]}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>Pas d’effort au-dessus du seuil</span>
          <ToggleSwitch label="Pas d’effort au-dessus du seuil" checked={avoidIntensity} onChange={setAvoidIntensity} />
        </div>
      </div>

      <h3 className="section-header">Note</h3>
      <div className="group">
        <FieldRow label="Note">
          <input className="field" aria-label="Note" value={note} maxLength={500} placeholder="Facultatif" onChange={(e) => setNote(e.target.value)} />
        </FieldRow>
      </div>

      {message && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {message}
        </p>
      )}

      {injury && !injury.endedOn && (
        <button type="button" className="button filled block pressable" style={{ marginTop: 16 }} disabled={save.isPending} onClick={onHealed}>
          Marquer comme guérie
        </button>
      )}
      {injury && (
        <button
          type="button"
          className="pressable"
          onClick={onDelete}
          disabled={remove.isPending}
          style={{ display: 'block', color: 'var(--red)', minHeight: 44, marginTop: 12 }}
        >
          {confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
        </button>
      )}
    </Sheet>
  );
}
