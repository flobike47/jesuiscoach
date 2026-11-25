import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { Cell, Page, Placeholder, Section, Sheet } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { useCalendar, useEditEvent, useTeam } from '@/hooks/useCoach';
import { useCare } from '@/hooks/useCare';
import { dayStatus } from '@/lib/availability';
import { formatDuration } from '@/lib/format';
import type { PlannedEvent } from '@/types';

/** Écran 6 (coach) : semaine d'un athlète de l'équipe, au choix. */
export default function Calendar() {
  return <CalendarView />;
}

/**
 * Semaine d'un athlète — séances prévues et sorties réalisées. Sans
 * `fixed`, le coach choisit l'athlète ; avec, c'est l'athlète lui-même (« Plan »).
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
  const today = dayjs().format('YYYY-MM-DD');
  const [editing, setEditing] = useState<PlannedEvent | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = weekStart.add(i, 'day');
    const key = d.format('YYYY-MM-DD');
    const planned = (cal.data?.events ?? []).filter((e) => e.category === 'WORKOUT' && e.start_date_local.startsWith(key));
    const done = (cal.data?.activities ?? []).filter((a) => a.start_date_local.startsWith(key));
    return { d, key, planned, done };
  });
  const doneIds = new Set(cal.data?.doneEventIds ?? []);
  const plannedLoad = (cal.data?.events ?? []).length;
  const doneCount = (cal.data?.activities ?? []).length;

  return (
    <Page
      title={fixed?.title ?? athletes.find((a) => a.id === athleteId)?.name ?? 'Calendrier'}
      header={
        !fixed && <select
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
            <div className="caption secondary">{d.format('dd').slice(0, 1).toUpperCase()}</div>
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

      {cal.isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
          <Spinner />
        </div>
      )}
      {cal.error && <Placeholder title="Calendrier indisponible">{cal.error.message}</Placeholder>}
      {cal.data && (
        <p className="footnote secondary" style={{ margin: '12px 4px 0' }}>
          {plannedLoad} séance{plannedLoad > 1 ? 's' : ''} prévue{plannedLoad > 1 ? 's' : ''} · {doneCount} sortie{doneCount > 1 ? 's' : ''} faite{doneCount > 1 ? 's' : ''}
        </p>
      )}

      {cal.data &&
        days
          .filter((x) => x.planned.length || x.done.length)
          .map(({ d, key, planned, done }) => (
            <Section key={key} header={d.format('dddd D MMMM')}>
              {planned.map((e, i) => {
                // Faite si le serveur l'a appariée à une sortie (aujourd'hui compris) ;
                // manquée seulement une fois la journée passée.
                const made = e.id != null && doneIds.has(String(e.id));
                const missed = !made && key < today;
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
                    subtitle={made ? 'Séance faite' : missed ? 'Séance manquée' : 'Prévue'}
                    // Une séance passée et faite ne se déplace plus.
                    onClick={!made && e.id != null ? () => setEditing(e) : undefined}
                    chevron={!made && e.id != null}
                  />
                );
              })}
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

/** Feuille d'une séance prévue : la déplacer dans la semaine (ou à une date) ou la supprimer. */
function EditEventSheet({ athleteId, event, weekStart, onClose }: { athleteId: string; event: PlannedEvent; weekStart: dayjs.Dayjs; onClose: () => void }) {
  const { move, remove } = useEditEvent();
  const current = event.start_date_local.slice(0, 10);
  const [date, setDate] = useState(current);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = move.isPending || remove.isPending;
  const eventId = String(event.id);

  const save = async () => {
    setError(null);
    if (date === current) return onClose();
    try {
      await move.mutateAsync({ athleteId, eventId, date });
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
      title={event.name ?? 'Séance'}
      action={
        <button type="button" onClick={save} disabled={busy} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {move.isPending ? 'Envoi…' : 'OK'}
        </button>
      }
    >
      <h3 className="section-header">Déplacer au</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }} role="radiogroup" aria-label="Jour de la semaine">
        {Array.from({ length: 7 }, (_, i) => {
          const d = weekStart.add(i, 'day');
          const key = d.format('YYYY-MM-DD');
          const on = key === date;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={d.format('dddd D MMMM')}
              onPointerDown={() => setDate(key)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setDate(key)}
              className="pressable"
              style={{ minHeight: 56, borderRadius: 10, background: on ? 'var(--tint)' : 'var(--fill)', color: on ? '#fff' : undefined }}
            >
              <div className="caption" style={{ opacity: 0.8 }}>{d.format('dd').slice(0, 1).toUpperCase()}</div>
              <div style={{ fontWeight: 600 }} className="tabular-nums">{d.date()}</div>
            </button>
          );
        })}
      </div>
      <div className="group" style={{ marginTop: 12 }}>
        <input type="date" className="field" aria-label="Autre date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <p className="section-footer">La séance est déplacée dans Intervals.icu, puis sur la montre ou le compteur à leur prochaine synchro.</p>

      <div className="group" style={{ marginTop: 28 }}>
        <button type="button" className="cell" onClick={destroy} disabled={busy} style={{ color: 'var(--red)', justifyContent: 'center' }}>
          {remove.isPending ? 'Suppression…' : confirmDelete ? 'Confirmer la suppression' : 'Supprimer la séance'}
        </button>
      </div>
      {confirmDelete && !remove.isPending && (
        <p className="section-footer">La séance disparaîtra du calendrier de l'athlète et de sa montre.</p>
      )}

      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}
