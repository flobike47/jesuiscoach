import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Placeholder, SkeletonList } from '@/components/ios';
import { WorkoutProfile } from '@/components/workout/StructureEditor';
import { EditEventSheet } from '@/components/calendar/EventSheets';
import { TeamLoadChart } from '@/components/calendar/TeamLoadChart';
import { teamWorkoutAsEvent } from '@/lib/teamEvent';
import { useSavedWorkouts, useTeam } from '@/hooks/useCoach';
import { useEventMutations } from '@/hooks/useCalendarData';
import { useGroups, useTeamCalendar } from '@/hooks/useTeamPlanning';
import { canDrop, dropPreview, type DropPreview } from '@/lib/dragPlan';
import { formatDuration, formatLoad, dayShort } from '@/lib/format';
import { formZone } from '@/lib/form';
import { cellKind, dominantColor, filterByGroup, shortDuration, textOn } from '@/lib/teamPlanning';
import { parseWorkout, TEMPLATES, workoutStats, type Sport } from '@/lib/workout';
import type { AppEvent } from '@/services/calendarApi';
import type { Group, TeamCalendarAthlete } from '@/types';

interface LibraryItem {
  key: string;
  name: string;
  description: string;
  sport: Sport;
  load: number;
  seconds: number;
}

/** Ce qu'on fait glisser : une séance de la bibliothèque, ou une séance déjà planifiée. */
type Drag =
  | { kind: 'library'; item: LibraryItem; x: number; y: number }
  | { kind: 'event'; athleteId: string; event: TeamCalendarAthlete['days'][number]['workouts'][number]; fromDate: string; x: number; y: number };

interface Undo {
  label: string;
  run: () => Promise<unknown>;
}

const SURVOL_MS = 150;
const UNDO_MS = 10_000;

function startOfWeek(d: dayjs.Dayjs): dayjs.Dayjs {
  return d.subtract((d.day() + 6) % 7, 'day').startOf('day');
}

const asLibraryItem = (key: string, name: string, description: string, sport: Sport): LibraryItem => {
  const s = workoutStats(parseWorkout(description));
  return { key, name, description, sport, load: s.load, seconds: s.seconds };
};

/**
 * Planning de l'équipe sur grand écran (iPad, ordinateur) : 2 semaines, la
 * bibliothèque à gauche, glisser-déposer pour planifier, déplacer (même
 * ligne) ou dupliquer (Alt / Option), annulable 10 s.
 */
export function TeamPlanningWide() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(dayjs()));
  const from = weekStart.format('YYYY-MM-DD');
  const [span, setSpan] = useState<7 | 14 | 28>(14);
  const weeks = Array.from({ length: span / 7 }, (_, i) => i);
  const to = weekStart.add(span - 1, 'day').format('YYYY-MM-DD');
  const cal = useTeamCalendar(from, to);
  const groups = useGroups();
  const team = useTeam();
  const saved = useSavedWorkouts();
  const { create, update, remove } = useEventMutations();

  const [group, setGroup] = useState<Group | null>(null);
  const [search, setSearch] = useState('');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ athleteId: string; event: AppEvent } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const undoTimer = useRef<number | undefined>(undefined);

  const athletes = useMemo(
    () => [...filterByGroup(cal.data?.athletes ?? [], group)].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [cal.data, group],
  );
  const days = useMemo(() => Array.from({ length: span }, (_, i) => weekStart.add(i, 'day').format('YYYY-MM-DD')), [weekStart, span]);
  const today = dayjs().format('YYYY-MM-DD');

  const library = useMemo(() => {
    const q = search.trim().toLowerCase();
    const mine = (saved.data?.workouts ?? []).map((w) => asLibraryItem(`saved-${w.id}`, w.name, w.description, w.sport));
    const types = TEMPLATES.map((t) => asLibraryItem(`app-${t.name}`, t.name, t.description, t.sport));
    return { mine: mine.filter((x) => !q || x.name.toLowerCase().includes(q)), types: types.filter((x) => !q || x.name.toLowerCase().includes(q)) };
  }, [saved.data, search]);

  const formOf = (id: string) => team.data?.athletes.find((a) => a.id === id)?.form ?? null;
  const weekLoad = (a: TeamCalendarAthlete, week: number) =>
    a.days.slice(week * 7, week * 7 + 7).reduce((s, d) => s + d.workouts.reduce((t, w) => t + (w.load ?? 0), 0), 0);
  // Charge habituelle ramenée à une semaine (le serveur la donne pour la période).
  const usualWeek = (a: TeamCalendarAthlete) => (a.load.usual != null && a.days.length ? (a.load.usual * 7) / a.days.length : null);
  const dayTotal = (date: string) =>
    athletes.reduce((s, a) => s + (a.days.find((d) => d.date === date)?.workouts.reduce((t, w) => t + (w.load ?? 0), 0) ?? 0), 0);

  /* ---------- Glisser-déposer ---------- */

  const cellAt = (x: number, y: number): { athleteId: string; date: string } | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]');
    if (!el?.dataset.cell) return null;
    const [athleteId, date] = el.dataset.cell.split('|');
    return { athleteId, date };
  };

  const draggedLoad = (d: Drag) => (d.kind === 'library' ? d.item.load : (d.event.load ?? 0));

  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    const cell = cellAt(e.clientX, e.clientY);
    const key = cell ? `${cell.athleteId}|${cell.date}` : null;
    if (key === hover) return;
    setHover(key);
    setPreview(null);
    window.clearTimeout(hoverTimer.current);
    const athlete = cell && athletes.find((a) => a.id === cell.athleteId);
    if (cell && athlete && canDrop(athlete, cell.date)) {
      hoverTimer.current = window.setTimeout(() => setPreview(dropPreview(athlete, cell.date, draggedLoad(drag))), SURVOL_MS);
    }
  };

  const endDrag = () => {
    window.clearTimeout(hoverTimer.current);
    setDrag(null);
    setHover(null);
    setPreview(null);
  };

  const offerUndo = (u: Undo) => {
    window.clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };

  const onDrop = async (e: ReactPointerEvent) => {
    const current = drag;
    const cell = cellAt(e.clientX, e.clientY);
    endDrag();
    if (!current || !cell) return;
    const athlete = athletes.find((a) => a.id === cell.athleteId);
    if (!athlete || !canDrop(athlete, cell.date)) return;
    setError(null);
    try {
      if (current.kind === 'library' || e.altKey) {
        // Nouvelle séance : depuis la bibliothèque, ou duplication (Alt) d'une séance planifiée.
        const src =
          current.kind === 'library'
            ? { name: current.item.name, description: current.item.description, sport: current.item.sport }
            : { name: current.event.name, description: current.event.description ?? '', sport: (current.event.sport ?? 'Ride') as Sport };
        if (current.kind === 'event' && current.athleteId !== cell.athleteId) return;
        const { event } = await create.mutateAsync({ athleteId: cell.athleteId, body: { kind: 'workout', date: cell.date, ...src } });
        offerUndo({ label: `« ${src.name} » ajoutée pour ${athlete.name}`, run: () => remove.mutateAsync({ athleteId: cell.athleteId, eventId: String(event.id) }) });
      } else {
        // Déplacement : seulement sur la même ligne (même athlète).
        if (current.athleteId !== cell.athleteId || current.fromDate === cell.date) return;
        const eventId = current.event.id;
        await update.mutateAsync({ athleteId: cell.athleteId, eventId, body: { date: cell.date } });
        offerUndo({ label: `« ${current.event.name} » déplacée`, run: () => update.mutateAsync({ athleteId: cell.athleteId, eventId, body: { date: current.fromDate } }) });
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && endDrag();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag]);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const startDrag = (e: ReactPointerEvent<HTMLElement>, d: Drag) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(d);
  };

  /* ---------- Rendu ---------- */

  const columns = `150px ${weeks.map(() => 'repeat(7, minmax(0, 1fr)) 52px').join(' ')}`;

  return (
    <div className="wide-planner" onPointerMove={onMove} onPointerUp={onDrop} onPointerCancel={endDrag}>
      <aside className="wide-library card">
        <h2 className="title-2" style={{ fontSize: 20 }}>Bibliothèque</h2>
        <label className="search-field" style={{ marginTop: 10 }}>
          <Search size={15} color="var(--label-2)" aria-hidden />
          <input type="search" aria-label="Rechercher dans la bibliothèque" placeholder="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="wide-shortcuts footnote secondary">
          <b>Raccourcis</b>
          <span>Glisser une séance sur une case libre : la planifier</span>
          <span>Glisser une séance planifiée : la déplacer</span>
          <span>⌥ Alt + glisser : la dupliquer</span>
          <span>Double-clic : la modifier · Échap : annuler</span>
        </div>
        {[
          { title: 'Mes séances', items: library.mine },
          { title: 'Séances types', items: library.types },
        ].map(
          (section) =>
            section.items.length > 0 && (
              <section key={section.title}>
                <h3 className="section-header" style={{ margin: '12px 2px 6px' }}>
                  {section.title}
                </h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {section.items.map((item) => (
                    <div
                      key={item.key}
                      className="wide-lib-item"
                      role="button"
                      tabIndex={0}
                      aria-label={`Glisser « ${item.name} » sur le planning`}
                      onPointerDown={(e) => startDrag(e, { kind: 'library', item, x: e.clientX, y: e.clientY })}
                    >
                      <WorkoutProfile steps={parseWorkout(item.description)} sport={item.sport} height={22} />
                      <div>
                        <b>{item.name}</b>{' '}
                        <span className="footnote secondary tabular-nums">
                          · {formatDuration(item.seconds)} · {formatLoad(item.load)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ),
        )}
      </aside>

      <main style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" aria-label="Période précédente" onClick={() => setWeekStart((w) => w.subtract(span, 'day'))} style={{ color: 'var(--tint)', minWidth: 36, minHeight: 36 }}>
            <ChevronLeft size={20} />
          </button>
          <span className="headline">
            {dayjs(from).format('D MMM')} – {dayjs(to).format('D MMM')}
          </span>
          <button type="button" aria-label="Période suivante" onClick={() => setWeekStart((w) => w.add(span, 'day'))} style={{ color: 'var(--tint)', minWidth: 36, minHeight: 36 }}>
            <ChevronRight size={20} />
          </button>
          <div className="segmented" role="tablist" aria-label="Période affichée" style={{ width: 280 }}>
            <span className="segmented-thumb" aria-hidden style={{ width: 'calc((100% - 4px) / 3)', transform: `translateX(${[7, 14, 28].indexOf(span) * 100}%)` }} />
            {([
              [7, 'Semaine'],
              [14, '2 semaines'],
              [28, 'Mois'],
            ] as const).map(([n, label]) => (
              <button key={n} type="button" role="tab" aria-selected={span === n} onPointerDown={() => setSpan(n)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSpan(n)}>
                {label}
              </button>
            ))}
          </div>
          <div className="chips" style={{ margin: 0, padding: 0, flex: 1, justifyContent: 'flex-end' }}>
            <button type="button" className={group == null ? 'chip active' : 'chip'} aria-pressed={group == null} onClick={() => setGroup(null)}>
              Tous · {cal.data?.athletes.length ?? 0}
            </button>
            {(groups.data?.groups ?? []).map((g) => (
              <button key={g.id} type="button" className={group?.id === g.id ? 'chip active' : 'chip'} aria-pressed={group?.id === g.id} onClick={() => setGroup(group?.id === g.id ? null : g)}>
                {g.name} · {g.athleteIds.length}
              </button>
            ))}
          </div>
        </div>

        {cal.isLoading && <SkeletonList rows={6} avatar={false} />}
        {cal.error && <Placeholder title="Planning indisponible">{(cal.error as Error).message}</Placeholder>}

        {cal.data && (
          <div className="wide-grid" style={{ gridTemplateColumns: columns }}>
            <span />
            {weeks.map((week) => (
              <div key={week} style={{ display: 'contents' }}>
                {days.slice(week * 7, week * 7 + 7).map((d) => (
                  <span key={d} className="wide-head" style={d === today ? { color: 'var(--tint)', fontWeight: 700 } : undefined}>
                    {dayShort(d)} {dayjs(d).date()}
                  </span>
                ))}
                <span className="wide-head" style={{ fontWeight: 600 }}>
                  Σ sem.
                </span>
              </div>
            ))}

            {athletes.map((a) => (
              <div key={a.id} style={{ display: 'contents' }}>
                <div className="wide-name">
                  <span className="dot" style={{ background: formOf(a.id) == null ? 'var(--gray)' : formZone(formOf(a.id)!).color }} aria-hidden />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  {a.ftp && <span className="caption secondary tabular-nums" style={{ marginLeft: 'auto' }}>{a.ftp} W</span>}
                </div>
                {a.error ? (
                  <span className="footnote secondary" style={{ gridColumn: `span ${weeks.length * 8}` }}>
                    Lecture impossible : {a.error}
                  </span>
                ) : (
                  weeks.map((week) => {
                    const load = weekLoad(a, week);
                    const usual = usualWeek(a);
                    return (
                      <div key={week} style={{ display: 'contents' }}>
                        {a.days.slice(week * 7, week * 7 + 7).map((day) => {
                          const kind = cellKind(day);
                          const w = day.workouts[0];
                          const bg = w ? dominantColor(w.description) : kind === 'off' ? 'repeating-linear-gradient(135deg, var(--fill-2) 0 2px, transparent 2px 7px)' : kind === 'extra' ? 'var(--fill-2)' : 'var(--cell)';
                          const key = `${a.id}|${day.date}`;
                          const label = `${a.name}, ${dayjs(day.date).format('dddd D MMMM')} : ${w ? w.name : kind === 'off' ? 'indisponible' : kind === 'extra' ? 'sortie hors plan' : 'libre'}`;
                          return (
                            <div
                              key={key}
                              data-cell={key}
                              className={hover === key ? (canDrop(a, day.date) ? 'wide-cell drop-ok' : 'wide-cell drop-no') : 'wide-cell'}
                              style={{ background: bg, color: w ? textOn(bg) : 'var(--label)', cursor: w ? 'grab' : undefined }}
                              title={label}
                              aria-label={label}
                              onPointerDown={w ? (e) => startDrag(e, { kind: 'event', athleteId: a.id, event: w, fromDate: day.date, x: e.clientX, y: e.clientY }) : undefined}
                              onDoubleClick={
                                w
                                  ? () => setEditing({ athleteId: a.id, event: teamWorkoutAsEvent(w, day.date) })
                                  : undefined
                              }
                            >
                              {w ? `${w.done ? '✓ ' : ''}${shortDuration(w.seconds)}` : kind === 'extra' ? '✓' : ''}
                            </div>
                          );
                        })}
                        <span className="wide-sum tabular-nums" style={{ color: usual && load > usual * 1.15 ? 'var(--orange)' : undefined }}>
                          {load ? formatLoad(load) : '–'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            ))}

            <span className="wide-name footnote secondary">Charge équipe</span>
            {weeks.map((week) => (
              <div key={week} style={{ display: 'contents' }}>
                {days.slice(week * 7, week * 7 + 7).map((d) => (
                  <span key={d} className="wide-head tabular-nums">
                    {formatLoad(dayTotal(d)) === '0' ? '' : formatLoad(dayTotal(d))}
                  </span>
                ))}
                <span />
              </div>
            ))}
          </div>
        )}

        <p className="footnote secondary" style={{ marginTop: 12 }}>
          Les cases rayées viennent des disponibilités du profil.
        </p>
        {cal.data && <TeamLoadChart athletes={athletes} from={from} to={to} today={today} />}
        {error && (
          <p role="alert" className="footnote" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        )}
      </main>

      {drag && (
        <div className="wide-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }} aria-hidden>
          {drag.kind === 'library' ? drag.item.name : drag.event.name}
          <div className="caption">{formatLoad(draggedLoad(drag))} de charge</div>
        </div>
      )}
      {drag && preview && (
        <div className="wide-preview" style={{ left: drag.x + 16, top: drag.y + 64 }} role="status">
          <b>{preview.title}</b>
          <div style={{ color: preview.overload ? 'var(--orange)' : 'var(--label-2)' }}>
            Charge semaine {preview.before} → {preview.after}
            {preview.pct ? ` (+${preview.pct} %)` : ''}
            {preview.overload ? ' · au-delà de l’habitude' : ''}
          </div>
          {preview.intenseEve && <div style={{ color: 'var(--orange)' }}>Séance intense la veille.</div>}
        </div>
      )}

      {undo && (
        <div className="wide-undo" role="status">
          <span>{undo.label}</span>
          <button
            type="button"
            onClick={async () => {
              const u = undo;
              setUndo(null);
              await u.run().catch((err: Error) => setError(err.message));
            }}
          >
            Annuler
          </button>
        </div>
      )}

      {editing && <EditEventSheet athleteId={editing.athleteId} event={editing.event} weekStart={weekStart} onClose={() => setEditing(null)} />}
    </div>
  );
}
