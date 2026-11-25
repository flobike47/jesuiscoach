import { useState, type ReactNode } from 'react';
import { Cell, Page, Placeholder, Section, Segmented, Sheet } from '@/components/ios';
import { NumberStepper } from '@/components/common/NumberStepper';
import { Spinner } from '@/components/common/PageLoader';
import { useProfileTarget } from '@/hooks/useProfileTarget';
import { useAddException, useCare, useDeleteException, useSaveAvailability } from '@/hooks/useCare';
import { DAY_NAMES, PLACE_LABELS, SLOT_LABELS, formatDuration, formatHours, formatLongDate, formatShortDay, weekSummary } from '@/lib/availability';
import type { CareDay, CareException, CareView, Place, Slot } from '@/services/careApi';

/** Page « Disponibilités » de la fiche profil : volume visé, semaine type, exceptions. */
export default function AvailabilityPage() {
  const { athleteId, base, self } = useProfileTarget();
  const care = useCare(athleteId);
  return (
    <Page title="Disponibilités" back={{ to: base, label: 'Profil' }}>
      {care.isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
          <Spinner />
        </div>
      )}
      {care.error && <Placeholder title="Disponibilités indisponibles">{care.error.message}</Placeholder>}
      {care.data && athleteId && (
        <AvailabilityForm key={JSON.stringify([care.data.weeklyMinutes, care.data.days])} athleteId={athleteId} data={care.data} self={self} />
      )}
    </Page>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : résumé « 5 jours · 8 h/sem. ». */
export function AvailabilityRow({ athleteId, base }: RowProps) {
  const care = useCare(athleteId);
  const subtitle = care.data ? weekSummary(care.data.days, care.data.weeklyMinutes) : undefined;
  return <Cell title="Disponibilités" subtitle={subtitle} to={`${base}/disponibilites`} chevron />;
}

/** Formulaire : le brouillon de la semaine est repris de la fiche ; les exceptions s'enregistrent tout de suite. */
function AvailabilityForm({ athleteId, data, self }: { athleteId: string; data: CareView; self: boolean }) {
  const [weeklyMinutes, setWeeklyMinutes] = useState<number | null>(data.weeklyMinutes);
  const [days, setDays] = useState<CareDay[]>(data.days);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useSaveAvailability(athleteId);

  const setDay = (weekday: number, patch: Partial<CareDay>) => setDays((all) => all.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

  const onSave = async () => {
    setMessage(null);
    try {
      await save.mutateAsync({ weeklyMinutes, days });
      setMessage({ ok: true, text: 'Semaine enregistrée.' });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <>
      <Section footer="Le volume visé sert de repère pour ton coach ; il ne fixe rien.">
        <NumberStepper
          label="Volume visé"
          value={weeklyMinutes == null ? null : weeklyMinutes / 60}
          onChange={(h) => setWeeklyMinutes(Math.round(h * 60))}
          min={0}
          max={50}
          step={0.5}
          unit="h/sem."
          format={(h) => formatHours(Math.round(h * 60))}
        />
      </Section>

      <Section
        header="Semaine type"
        footer={self && data.updatedBy === 'coach' && data.updatedAt ? `Modifié par ton coach le ${formatLongDate(data.updatedAt)}.` : 'Les jours de repos ne sont pas proposés au calendrier de ton coach.'}
      >
        {[...days]
          .sort((a, b) => a.weekday - b.weekday)
          .map((d) => (
            <div key={d.weekday}>
              <Cell
                title={DAY_NAMES[d.weekday]}
                subtitle={d.available ? describeDay(d) : 'Repos'}
                detail={<ToggleSwitch label={`${DAY_NAMES[d.weekday]} disponible`} checked={d.available} onChange={(v) => setDay(d.weekday, { available: v })} />}
                onClick={d.available ? () => setOpenDay(openDay === d.weekday ? null : d.weekday) : undefined}
                chevron={d.available}
              />
              {d.available && openDay === d.weekday && (
                <DayDetails day={d} onChange={(patch) => setDay(d.weekday, patch)} />
              )}
            </div>
          ))}
        <div style={{ padding: '8px 16px 0' }}>
          <button type="button" className="button filled block pressable" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer la semaine'}
          </button>
          {message && (
            <p role={message.ok ? 'status' : 'alert'} className="footnote" style={{ color: message.ok ? 'var(--green)' : 'var(--red)', margin: '10px 4px 4px' }}>
              {message.text}
            </p>
          )}
        </div>
      </Section>

      <ExceptionsSection athleteId={athleteId} exceptions={data.exceptions} />
    </>
  );
}

/** Réglages d'un jour disponible : temps max, créneau, lieu. */
function DayDetails({ day, onChange }: { day: CareDay; onChange: (patch: Partial<CareDay>) => void }) {
  return (
    <div style={{ padding: '4px 16px 14px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <span>Limiter la durée</span>
        <ToggleSwitch label="Limiter la durée" checked={day.maxMinutes != null} onChange={(v) => onChange({ maxMinutes: v ? 60 : null })} />
      </div>
      {day.maxMinutes != null && (
        <NumberStepper label="Temps max" value={day.maxMinutes} onChange={(v) => onChange({ maxMinutes: v })} min={15} max={720} step={15} format={formatDuration} />
      )}
      <Segmented<Slot>
        label="Créneau"
        value={day.slot}
        onChange={(slot) => onChange({ slot })}
        options={(['any', 'morning', 'noon', 'evening'] as const).map((s) => ({ value: s, label: SLOT_LABELS[s] }))}
      />
      <Segmented<Place>
        label="Lieu"
        value={day.place}
        onChange={(place) => onChange({ place })}
        options={(['any', 'outdoor', 'indoor'] as const).map((p) => ({ value: p, label: PLACE_LABELS[p] }))}
      />
    </div>
  );
}

/** Résumé d'un jour disponible : « 1 h max · matin · home trainer ». */
function describeDay(d: CareDay): string {
  const parts = [
    d.maxMinutes != null ? `${formatDuration(d.maxMinutes)} max` : 'sans limite',
    d.slot !== 'any' ? SLOT_LABELS[d.slot].toLowerCase() : null,
    d.place !== 'any' ? PLACE_LABELS[d.place].toLowerCase() : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Exceptions (vacances, déplacement) : liste, ajout dans une feuille, suppression. */
function ExceptionsSection({ athleteId, exceptions }: { athleteId: string; exceptions: CareException[] }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useDeleteException(athleteId);
  const onDelete = async (id: string) => {
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Section header="Exceptions" footer="Vacances, déplacement : ton coach ne te proposera rien pendant ces dates.">
      {exceptions.map((e) => (
        <Cell
          key={e.id}
          title={e.fromDay === e.toDay ? formatShortDay(e.fromDay) : `${formatShortDay(e.fromDay)} – ${formatShortDay(e.toDay)}`}
          subtitle={e.note ?? undefined}
          detail={
            <button type="button" onClick={() => onDelete(e.id)} aria-label={`Supprimer l'exception du ${e.fromDay}`} style={{ color: 'var(--red)', minHeight: 44, padding: '0 4px' }}>
              Supprimer
            </button>
          }
        />
      ))}
      <Cell onClick={() => setAdding(true)} title={<span style={{ color: 'var(--tint)' }}>Ajouter une exception</span>} />
      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '8px 16px' }}>
          {error}
        </p>
      )}
      {adding && <ExceptionSheet athleteId={athleteId} onClose={() => setAdding(false)} />}
    </Section>
  );
}

function ExceptionSheet({ athleteId, onClose }: { athleteId: string; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDay, setFromDay] = useState(today);
  const [toDay, setToDay] = useState(today);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const add = useAddException(athleteId);

  const onAdd = async () => {
    setMessage(null);
    if (toDay < fromDay) return setMessage('La fin doit être après le début.');
    try {
      await add.mutateAsync({ fromDay, toDay, note: note.trim() || null });
      onClose();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Exception"
      action={
        <button type="button" onClick={onAdd} disabled={add.isPending} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {add.isPending ? 'Ajout…' : 'Ajouter'}
        </button>
      }
    >
      <div className="group">
        <FieldRow label="Du">
          <input type="date" className="field" aria-label="Du" value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
        </FieldRow>
        <FieldRow label="Au">
          <input type="date" className="field" aria-label="Au" value={toDay} onChange={(e) => setToDay(e.target.value)} />
        </FieldRow>
        <FieldRow label="Note">
          <input className="field" aria-label="Note" value={note} maxLength={200} placeholder="Vacances, ski…" onChange={(e) => setNote(e.target.value)} />
        </FieldRow>
      </div>
      {message && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {message}
        </p>
      )}
    </Sheet>
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <span style={{ width: 56 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

/**
 * Interrupteur iOS (cible tactile de 44 px). Un toucher ne déclenche pas la
 * ligne qui le contient.
 */
export function ToggleSwitch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      style={{ width: 52, height: 44, display: 'grid', placeItems: 'center', opacity: disabled ? 0.4 : 1, flex: '0 0 auto' }}
    >
      <span
        aria-hidden
        style={{ position: 'relative', display: 'block', width: 51, height: 31, borderRadius: 16, background: checked ? 'var(--green)' : 'var(--fill)', transition: 'background 200ms' }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: 27,
            height: 27,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
            transition: 'left 200ms',
          }}
        />
      </span>
    </button>
  );
}
