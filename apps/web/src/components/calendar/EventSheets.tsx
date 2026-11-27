import { useState } from 'react';
import dayjs from 'dayjs';
import { NumberStepper } from '@/components/common/NumberStepper';
import { StructureEditor } from '@/components/workout/StructureEditor';
import { Segmented, Sheet } from '@/components/ios';
import { useEventMutations } from '@/hooks/useCalendarData';
import { convertForSport } from '@/lib/workoutBlocks';
import { SPORT_LABELS, type Sport } from '@/lib/workout';
import type { AppEvent, EventInput, EventPatch, RacePriority } from '@/services/calendarApi';

const SPORTS: Sport[] = ['Ride', 'Run', 'Swim'];

/** Les sept jours de la semaine, pour choisir une date. */
export function DayPicker({ weekStart, value, onChange }: { weekStart: dayjs.Dayjs; value: string; onChange: (key: string) => void }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }} role="radiogroup" aria-label="Jour de la semaine">
        {Array.from({ length: 7 }, (_, i) => {
          const d = weekStart.add(i, 'day');
          const key = d.format('YYYY-MM-DD');
          const on = key === value;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={d.format('dddd D MMMM')}
              onClick={() => onChange(key)}
              className="pressable"
              style={{ minHeight: 56, borderRadius: 10, background: on ? 'var(--tint)' : 'var(--fill)', color: on ? '#fff' : undefined }}
            >
              <div className="caption" style={{ opacity: 0.8 }}>{d.format('dd').slice(0, 1).toUpperCase()}</div>
              <div style={{ fontWeight: 600 }} className="tabular-nums">
                {d.date()}
              </div>
            </button>
          );
        })}
      </div>
      <div className="group" style={{ marginTop: 8 }}>
        <input type="date" className="field" aria-label="Autre date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
      </div>
    </>
  );
}

/** Feuille d'une séance : nom, sport, structure, date, ou suppression. */
export function EditEventSheet({ athleteId, event, weekStart, onClose, initialDate }: { athleteId: string; event: AppEvent; weekStart: dayjs.Dayjs; onClose: () => void; initialDate?: string }) {
  const { update, remove } = useEventMutations();
  const current = event.start_date_local.slice(0, 10);
  const [name, setName] = useState(event.name ?? '');
  const [sport, setSport] = useState<Sport>((SPORTS.find((s) => s === event.type) ?? 'Ride') as Sport);
  const [description, setDescription] = useState(event.description ?? '');
  const [date, setDate] = useState(initialDate ?? current);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = update.isPending || remove.isPending;
  const eventId = String(event.id);

  const changeSport = (next: Sport) => {
    if (next === sport) return;
    setDescription(convertForSport(description, next));
    setSport(next);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Le nom est requis.');
    const patch: EventPatch = {};
    if (date !== current) patch.date = date;
    if (name.trim() !== (event.name ?? '')) patch.name = name.trim();
    if (sport !== (event.type ?? 'Ride')) patch.sport = sport;
    if (description !== (event.description ?? '')) patch.description = description;
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
      title="Séance"
      action={
        <button type="button" onClick={save} disabled={busy} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {update.isPending ? 'Envoi…' : 'OK'}
        </button>
      }
    >
      <div className="group">
        <input className="field" aria-label="Nom de la séance" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </div>
      <h3 className="section-header">Sport</h3>
      <Segmented<Sport> label="Sport" value={sport} onChange={changeSport} options={SPORTS.map((s) => ({ value: s, label: SPORT_LABELS[s] }))} />
      <h3 className="section-header">Structure</h3>
      <StructureEditor key={sport} description={description} sport={sport} onChange={setDescription} />

      <h3 className="section-header">Déplacer au</h3>
      <DayPicker weekStart={weekStart} value={date} onChange={setDate} />
      <p className="section-footer">La séance est mise à jour dans Intervals.icu, puis sur la montre ou le compteur à leur prochaine synchro.</p>

      <div className="group" style={{ marginTop: 28 }}>
        <button type="button" className="cell" onClick={destroy} disabled={busy} style={{ color: 'var(--red)', justifyContent: 'center' }}>
          {remove.isPending ? 'Suppression…' : confirmDelete ? 'Confirmer la suppression' : 'Supprimer la séance'}
        </button>
      </div>
      {confirmDelete && !remove.isPending && <p className="section-footer">La séance disparaîtra du calendrier de l'athlète et de sa montre.</p>}

      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}

type NewKind = 'workout' | 'race' | 'note' | 'rest';

const KIND_OPTIONS: ReadonlyArray<{ value: NewKind; label: string }> = [
  { value: 'workout', label: 'Séance' },
  { value: 'race', label: 'Compétition' },
  { value: 'note', label: 'Note' },
  { value: 'rest', label: 'Repos' },
];

/**
 * Feuille d'ajout : une séance, une compétition (A/B/C), une note ou, pour le
 * coach (`allowRest`), un repos prescrit.
 */
export function NewEventSheet({ athleteId, weekStart, defaultDay, onClose, allowRest = false }: { athleteId: string; weekStart: dayjs.Dayjs; defaultDay: dayjs.Dayjs; onClose: () => void; allowRest?: boolean }) {
  const { create } = useEventMutations();
  const [kind, setKind] = useState<NewKind>('workout');
  const [name, setName] = useState('');
  const [date, setDate] = useState(defaultDay.format('YYYY-MM-DD'));
  const [sport, setSport] = useState<Sport>('Ride');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<RacePriority>('B');
  const [km, setKm] = useState<number | null>(null);
  const [goalText, setGoalText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    // Un repos sans nom s'appelle « Repos » (le BFF le nomme).
    if (!name.trim() && kind !== 'rest') return setError('Le nom est requis.');
    const body: EventInput = { kind, date, name: name.trim() };
    if (kind === 'workout') Object.assign(body, { sport, description });
    if (kind === 'race') Object.assign(body, { racePriority: priority, raceDistanceM: km ? Math.round(km * 1000) : null, raceGoal: goalText.trim() || null });
    if (kind === 'note' || kind === 'rest') Object.assign(body, { description: description || null });
    try {
      await create.mutateAsync({ athleteId, body });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Ajouter"
      action={
        <button type="button" onClick={save} disabled={create.isPending} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {create.isPending ? 'Envoi…' : 'OK'}
        </button>
      }
    >
      <Segmented<NewKind> label="Type" value={kind} onChange={setKind} options={KIND_OPTIONS.filter((o) => allowRest || o.value !== 'rest').map((o) => ({ ...o }))} />
      <div className="group" style={{ marginTop: 12 }}>
        <input className="field" aria-label="Nom" placeholder={kind === 'rest' ? 'Repos' : 'Nom'} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </div>

      {kind === 'workout' && (
        <>
          <h3 className="section-header">Sport</h3>
          <Segmented<Sport>
            label="Sport"
            value={sport}
            onChange={(next) => {
              setDescription(convertForSport(description, next));
              setSport(next);
            }}
            options={SPORTS.map((s) => ({ value: s, label: SPORT_LABELS[s] }))}
          />
          <h3 className="section-header">Structure</h3>
          <StructureEditor key={sport} description={description} sport={sport} onChange={setDescription} />
        </>
      )}

      {kind === 'race' && (
        <>
          <h3 className="section-header">Priorité</h3>
          <Segmented<RacePriority>
            label="Priorité"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'A', label: 'A' },
              { value: 'B', label: 'B' },
              { value: 'C', label: 'C' },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <NumberStepper label="Distance" value={km} onChange={setKm} min={0} max={1000} step={1} unit="km" />
          </div>
          <div className="group" style={{ marginTop: 12 }}>
            <input className="field" aria-label="Objectif" placeholder="Objectif (ex. finir en 4 h 30)" value={goalText} onChange={(e) => setGoalText(e.target.value)} maxLength={200} />
          </div>
        </>
      )}

      {kind === 'rest' && (
        <>
          <div className="group" style={{ marginTop: 12 }}>
            <input className="field" aria-label="Consigne du repos" placeholder="Consigne (facultatif)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
          </div>
          <p className="section-footer">Un repos prescrit : aucune séance ne sera proposée ce jour-là. L'athlète le voit dans son calendrier.</p>
        </>
      )}

      {kind === 'note' && (
        <div className="group" style={{ marginTop: 12 }}>
          <input className="field" aria-label="Texte de la note" placeholder="Texte (facultatif)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
        </div>
      )}

      <h3 className="section-header">Date</h3>
      <DayPicker weekStart={weekStart} value={date} onChange={setDate} />

      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}
