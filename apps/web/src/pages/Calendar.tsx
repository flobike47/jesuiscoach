import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { Cell, Page, Placeholder, Section } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { useCalendar, useTeam } from '@/hooks/useCoach';
import { formatDuration } from '@/lib/format';

/** Écran 6 : semaine d'un athlète — séances prévues et sorties réalisées. */
export default function Calendar() {
  const team = useTeam();
  const athletes = useMemo(() => [...(team.data?.athletes ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [team.data]);
  const [picked, setPicked] = useState<string | null>(null);
  const athleteId = picked ?? athletes[0]?.id;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(dayjs()));
  const from = weekStart.format('YYYY-MM-DD');
  const to = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const cal = useCalendar(athleteId, from, to);
  const today = dayjs().format('YYYY-MM-DD');

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = weekStart.add(i, 'day');
    const key = d.format('YYYY-MM-DD');
    const planned = (cal.data?.events ?? []).filter((e) => e.category === 'WORKOUT' && e.start_date_local.startsWith(key));
    const done = (cal.data?.activities ?? []).filter((a) => a.start_date_local.startsWith(key));
    return { d, key, planned, done };
  });
  const plannedLoad = (cal.data?.events ?? []).length;
  const doneCount = (cal.data?.activities ?? []).length;

  return (
    <Page
      title={athletes.find((a) => a.id === athleteId)?.name ?? 'Calendrier'}
      header={
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
        {days.map(({ d, key, planned, done }) => (
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
                background: key === today ? 'var(--tint)' : 'transparent',
                color: key === today ? '#fff' : undefined,
                fontWeight: key === today ? 600 : 400,
              }}
            >
              {d.date()}
            </div>
            <Dot planned={planned.length > 0} done={done.length > 0} past={key < today} />
          </div>
        ))}
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
                // Faite dès qu'une sortie existe ce jour-là (aujourd'hui compris) ;
                // manquée seulement une fois la journée passée.
                const made = done.length > 0;
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
