import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Check, Flag, Plus, RotateCw, X } from 'lucide-react';
import { Cell, Page, Placeholder, Section, Segmented, Sheet, SkeletonList } from '@/components/ios';
import { NumberStepper } from '@/components/common/NumberStepper';
import { StructureEditor } from '@/components/workout/StructureEditor';
import { useCalendar, useTeam } from '@/hooks/useCoach';
import { useCare } from '@/hooks/useCare';
import { useEventMutations } from '@/hooks/useCalendarData';
import { dayStatus } from '@/lib/availability';
import { PRIORITY_LABEL, formatRaceDistance, needsResync } from '@/lib/calendar';
import { formatDuration, dayShort } from '@/lib/format';
import { SPORT_LABELS, type Sport } from '@/lib/workout';
import { convertForSport } from '@/lib/workoutBlocks';
import type { AppEvent, EventInput, EventPatch, RacePriority } from '@/services/calendarApi';

/** Écran 6 (coach) : semaine d'un athlète de l'équipe, au choix. */
export default function Calendar() {
  return <CalendarView />;
}

const SPORTS: Sport[] = ['Ride', 'Run', 'Swim'];

/**
 * Semaine d'un athlète — séances prévues, compétitions, notes et sorties réalisées.
 * Sans `fixed`, le coach choisit l'athlète ; avec, c'est l'athlète lui-même (« Plan »).
 */
export function CalendarView({ fixed }: { fixed?: { id: string; title: string } }) {
  const team = useTeam(!fixed);
  const athletes = useMemo(() => [...(team.data?.athletes ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [team.data]);
  const [picked, setPicked] = useState<string | null>(null);
  const athleteId = fixed?.id ?? picked ?? athletes[0]?.id;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(dayjs()));
  const from = weekStart.format('YYYY-MM-DD');
  const to = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const cal = useCalendar(athleteId, from, to);
  // Jours de repos et exceptions de l'athlète : grisés, sans changer le calendrier.
  const care = useCare(athleteId);
  const { resync } = useEventMutations();
  const today = dayjs().format('YYYY-MM-DD');
  const [editing, setEditing] = useState<AppEvent | null>(null);
  const [adding, setAdding] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);

  const events = (cal.data?.events ?? []) as AppEvent[];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = weekStart.add(i, 'day');
    const key = d.format('YYYY-MM-DD');
    const onDay = (e: AppEvent) => e.start_date_local.startsWith(key);
    const planned = events.filter((e) => e.category === 'WORKOUT' && onDay(e));
    const races = events.filter((e) => e.category?.startsWith('RACE_') && onDay(e));
    const notes = events.filter((e) => e.category === 'NOTE' && onDay(e));
    const done = (cal.data?.activities ?? []).filter((a) => a.start_date_local.startsWith(key));
    return { d, key, planned, races, notes, done };
  });
  const doneIds = new Set(cal.data?.doneEventIds ?? []);
  const plannedCount = events.filter((e) => e.category === 'WORKOUT').length;
  const doneCount = (cal.data?.activities ?? []).length;
  const selectedDay = today >= from && today <= to ? dayjs(today) : weekStart;

  const doResync = async (e: AppEvent) => {
    if (!athleteId || e.id == null) return;
    setResyncError(null);
    try {
      await resync.mutateAsync({ athleteId, eventId: String(e.id) });
    } catch (err) {
      setResyncError((err as Error).message);
    }
  };

  return (
    <Page
      title={fixed?.title ?? athletes.find((a) => a.id === athleteId)?.name ?? 'Calendrier'}
      actions={
        athleteId ? (
          <button type="button" onClick={() => setAdding(true)} aria-label="Ajouter au calendrier" style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center' }}>
            <Plus size={24} />
          </button>
        ) : undefined
      }
      header={
        !fixed && (
          <select
            aria-label="Athlète"
            value={athleteId ?? ''}
            onChange={(e) => setPicked(e.target.value)}
            className="field"
            style={{ background: 'var(--fill)', borderRadius: 10, minHeight: 36, padding: '6px 12px', marginBottom: 12 }}
          >
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' }}>
        <button type="button" aria-label="Semaine précédente" onClick={() => setWeekStart((w) => w.subtract(7, 'day'))} style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}>
          <ChevronLeft size={24} />
        </button>
        <span className="headline">
          {weekStart.format('D MMM')} – {weekStart.add(6, 'day').format('D MMM')}
        </span>
        <button type="button" aria-label="Semaine suivante" onClick={() => setWeekStart((w) => w.add(7, 'day'))} style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}>
          <ChevronRight size={24} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: 2 }}>
        {days.map(({ d, key, planned, done }) => {
          const status = care.data ? dayStatus(key, care.data) : null;
          return (
            <div key={key}>
              <div className="caption secondary">{dayShort(key)}</div>
              <div
                className="tabular-nums"
                style={{
                  width: 32,
                  height: 32,
                  lineHeight: '32px',
                  margin: '2px auto',
                  borderRadius: '50%',
                  background: key === today ? 'var(--tint)' : status ? 'var(--fill)' : 'transparent',
                  color: key === today ? '#fff' : status ? 'var(--label-2)' : undefined,
                  fontWeight: key === today ? 600 : 400,
                }}
              >
                {d.date()}
              </div>
              <Dot planned={planned.length > 0} done={done.length > 0} past={key < today} />
              {status && (
                <div className="caption secondary" style={{ fontSize: 10, lineHeight: '12px', marginTop: 2 }} aria-label={`${d.format('dddd')} : ${status}`}>
                  {status === 'repos' ? 'repos' : 'indispo.'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cal.isLoading && <SkeletonList rows={4} avatar={false} />}
      {cal.error && <Placeholder title="Calendrier indisponible">{cal.error.message}</Placeholder>}
      {cal.data && (
        <p className="footnote secondary" style={{ margin: '12px 4px 0' }}>
          {plannedCount} séance{plannedCount > 1 ? 's' : ''} prévue{plannedCount > 1 ? 's' : ''} · {doneCount} sortie{doneCount > 1 ? 's' : ''} faite{doneCount > 1 ? 's' : ''}
        </p>
      )}
      {resyncError && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {resyncError}
        </p>
      )}

      {cal.data &&
        days
          .filter((x) => x.planned.length || x.races.length || x.notes.length || x.done.length)
          .map(({ d, key, planned, races, notes, done }) => (
            <Section key={key} header={d.format('dddd D MMMM')}>
              {races.map((e) => (
                <Cell
                  key={`r${String(e.id)}`}
                  inset={44}
                  leading={<Flag size={18} color="var(--orange)" aria-label="Compétition" />}
                  title={e.name ?? 'Compétition'}
                  subtitle={[e.racePriority ? PRIORITY_LABEL[e.racePriority] : null, formatRaceDistance(e.raceDistanceM ?? null)].filter(Boolean).join(' · ') || 'Compétition'}
                  detail={needsResync(e.syncStatus) ? <span style={{ color: 'var(--red)', fontSize: 13 }}>Non synchronisée</span> : undefined}
                />
              ))}
              {notes.map((e) => (
                <Cell key={`n${String(e.id)}`} inset={44} title={e.name ?? 'Note'} subtitle="Note" />
              ))}
              {planned.map((e, i) => {
                // Faite si le serveur l'a appariée à une sortie (aujourd'hui compris) ;
                // manquée seulement une fois la journée passée.
                const made = e.id != null && doneIds.has(String(e.id));
                const missed = !made && key < today;
                const unsynced = needsResync(e.syncStatus);
                return (
                  <Cell
                    key={`p${i}`}
                    inset={44}
                    leading={
                      made ? (
                        <Check size={18} color="var(--green)" aria-label="Faite" />
                      ) : missed ? (
                        <X size={18} color="var(--red)" aria-label="Manquée" />
                      ) : (
                        <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--tint)' }} aria-label="À venir" />
                      )
                    }
                    title={e.name ?? 'Séance'}
                    subtitle={made ? 'Séance faite' : missed ? 'Séance manquée' : unsynced ? 'Non synchronisée' : 'Prévue'}
                    // Une séance passée et faite ne se modifie plus.
                    onClick={!made && e.id != null ? () => setEditing(e) : undefined}
                    chevron={!made && e.id != null}
                  />
                );
              })}
              {planned
                .filter((e) => needsResync(e.syncStatus) && e.id != null)
                .map((e) => (
                  <Cell
                    key={`s${String(e.id)}`}
                    inset={44}
                    leading={<RotateCw size={18} color="var(--tint)" aria-hidden />}
                    title={<span style={{ color: 'var(--tint)' }}>Renvoyer vers Intervals.icu</span>}
                    subtitle={e.syncError ?? undefined}
                    onClick={() => doResync(e)}
                  />
                ))}
              {done
                .filter(() => planned.length === 0)
                .map((a) => (
                  <Cell
                    key={a.id}
                    inset={44}
                    leading={<Check size={18} color="var(--label-2)" aria-hidden />}
                    title={a.name ?? 'Sortie'}
                    subtitle={`Hors plan · ${formatDuration(a.moving_time)}`}
                  />
                ))}
            </Section>
          ))}

      {editing && athleteId && (
        <EditEventSheet key={String(editing.id)} athleteId={athleteId} event={editing} weekStart={weekStart} onClose={() => setEditing(null)} />
      )}
      {adding && athleteId && <NewEventSheet athleteId={athleteId} weekStart={weekStart} defaultDay={selectedDay} onClose={() => setAdding(false)} />}
    </Page>
  );
}

function startOfWeek(d: dayjs.Dayjs): dayjs.Dayjs {
  // Semaine du lundi au dimanche.
  const offset = (d.day() + 6) % 7;
  return d.subtract(offset, 'day').startOf('day');
}

function Dot({ planned, done, past }: { planned: boolean; done: boolean; past: boolean }) {
  let color = 'transparent';
  if (planned && done) color = 'var(--green)';
  else if (planned && past) color = 'var(--red)';
  else if (planned) color = 'var(--tint)';
  else if (done) color = 'var(--label-3)';
  return <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color }} />;
}

/** Les sept jours de la semaine, pour choisir une date. */
function DayPicker({ weekStart, value, onChange }: { weekStart: dayjs.Dayjs; value: string; onChange: (key: string) => void }) {
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
              <div style={{ fontWeight: 600 }} className="tabular-nums">{d.date()}</div>
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
function EditEventSheet({ athleteId, event, weekStart, onClose }: { athleteId: string; event: AppEvent; weekStart: dayjs.Dayjs; onClose: () => void }) {
  const { update, remove } = useEventMutations();
  const current = event.start_date_local.slice(0, 10);
  const [name, setName] = useState(event.name ?? '');
  const [sport, setSport] = useState<Sport>((SPORTS.find((s) => s === event.type) ?? 'Ride') as Sport);
  const [description, setDescription] = useState(event.description ?? '');
  const [date, setDate] = useState(current);
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

const KIND_OPTIONS = [
  { value: 'workout', label: 'Séance' },
  { value: 'race', label: 'Compétition' },
  { value: 'note', label: 'Note' },
] as const;

/** Feuille d'ajout : une séance, une compétition (A/B/C) ou une note. */
function NewEventSheet({ athleteId, weekStart, defaultDay, onClose }: { athleteId: string; weekStart: dayjs.Dayjs; defaultDay: dayjs.Dayjs; onClose: () => void }) {
  const { create } = useEventMutations();
  const [kind, setKind] = useState<'workout' | 'race' | 'note'>('workout');
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
    if (!name.trim()) return setError('Le nom est requis.');
    const body: EventInput = { kind, date, name: name.trim() };
    if (kind === 'workout') Object.assign(body, { sport, description });
    if (kind === 'race') Object.assign(body, { racePriority: priority, raceDistanceM: km ? Math.round(km * 1000) : null, raceGoal: goalText.trim() || null });
    if (kind === 'note') Object.assign(body, { description: description || null });
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
      <Segmented<'workout' | 'race' | 'note'> label="Type" value={kind} onChange={setKind} options={KIND_OPTIONS.map((o) => ({ ...o }))} />
      <div className="group" style={{ marginTop: 12 }}>
        <input className="field" aria-label="Nom" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
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
