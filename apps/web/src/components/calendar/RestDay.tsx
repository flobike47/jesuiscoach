import { useState } from 'react';
import dayjs from 'dayjs';
import { Bed } from 'lucide-react';
import { Sheet } from '@/components/ios';
import { DayPicker } from '@/components/calendar/EventSheets';
import { useEventMutations } from '@/hooks/useCalendarData';
import { PRESCRIBED_REST_LABEL, restDetail } from '@/lib/restDay';
import type { AppEvent, EventPatch } from '@/services/calendarApi';

/**
 * Repos prescrit par le coach : carte du calendrier et feuille de modification.
 * Visuellement distinct du « Repos habituel » (gris, venu des disponibilités) :
 * fond indigo teinté et icône de lit.
 */

const restTint = 'color-mix(in srgb, var(--indigo) 16%, transparent)';

/** Carte d'un repos prescrit. Sans `onEdit` (athlète), elle est en lecture seule. */
export function RestCard({ event, onEdit }: { event: AppEvent; onEdit?: () => void }) {
  const detail = restDetail(event);
  const content = (
    <>
      <Bed size={16} color="var(--indigo)" aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--indigo)' }}>{PRESCRIBED_REST_LABEL}</span>
        {detail && <span style={{ fontSize: 13, color: 'var(--label-2)' }}>{detail}</span>}
      </span>
    </>
  );
  const style = { background: restTint, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' as const, minHeight: 44, width: '100%' };
  return onEdit ? (
    <button type="button" className="pressable" onClick={onEdit} aria-label={`${PRESCRIBED_REST_LABEL}${detail ? ` : ${detail}` : ''}, modifier`} style={style}>
      {content}
    </button>
  ) : (
    <div style={style}>{content}</div>
  );
}

/** Feuille d'un repos prescrit : consigne, date, ou suppression (coach). */
export function RestSheet({ athleteId, event, weekStart, onClose }: { athleteId: string; event: AppEvent; weekStart: dayjs.Dayjs; onClose: () => void }) {
  const { update, remove } = useEventMutations();
  const current = event.start_date_local.slice(0, 10);
  const [description, setDescription] = useState(event.description ?? '');
  const [date, setDate] = useState(current);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = update.isPending || remove.isPending;
  const eventId = String(event.id);

  const save = async () => {
    setError(null);
    const patch: EventPatch = {};
    if (date !== current) patch.date = date;
    if (description.trim() !== (event.description ?? '')) patch.description = description.trim() || null;
    if (Object.keys(patch).length === 0) return onClose();
    try {
      await update.mutateAsync({ athleteId, eventId, body: patch });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const destroy = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    setError(null);
    try {
      await remove.mutateAsync({ athleteId, eventId });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={PRESCRIBED_REST_LABEL}
      action={
        <button type="button" onClick={save} disabled={busy} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {update.isPending ? 'Envoi…' : 'OK'}
        </button>
      }
    >
      <div className="group">
        <input className="field" aria-label="Consigne du repos" placeholder="Consigne (facultatif)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
      </div>
      <p className="section-footer">Aucune séance ne sera proposée ce jour-là. Le repos apparaît aussi comme une note dans Intervals.icu.</p>

      <h3 className="section-header">Déplacer au</h3>
      <DayPicker weekStart={weekStart} value={date} onChange={setDate} />

      <div className="group" style={{ marginTop: 28 }}>
        <button type="button" className="cell" onClick={destroy} disabled={busy} style={{ color: 'var(--red)', justifyContent: 'center' }}>
          {remove.isPending ? 'Suppression…' : confirmDelete ? 'Confirmer la suppression' : 'Supprimer le repos'}
        </button>
      </div>

      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}
