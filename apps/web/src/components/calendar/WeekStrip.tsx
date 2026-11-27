import dayjs from 'dayjs';
import { useCalendar } from '@/hooks/useCoach';
import { dayShort, formatLoad } from '@/lib/format';
import { weekLoad } from '@/lib/calendar';
import { parseWorkout, workoutStats } from '@/lib/workout';
import type { AppEvent } from '@/services/calendarApi';

/**
 * « Cette semaine » d'un athlète : une barre par jour (pleine = charge faite,
 * pointillée = charge prévue), aujourd'hui entouré, et la charge faite / prévue.
 * Une seule lecture du calendrier de la semaine (cache partagé avec Calendrier).
 */
export function WeekStrip({ athleteId }: { athleteId: string }) {
  const today = dayjs().format('YYYY-MM-DD');
  const monday = dayjs().subtract((dayjs().day() + 6) % 7, 'day');
  const from = monday.format('YYYY-MM-DD');
  const to = monday.add(6, 'day').format('YYYY-MM-DD');
  const cal = useCalendar(athleteId, from, to);
  if (!cal.data) return null;

  const events = cal.data.events as AppEvent[];
  const totals = weekLoad(events, cal.data.activities, from, to);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = monday.add(i, 'day').format('YYYY-MM-DD');
    const done = cal.data!.activities.filter((a) => a.start_date_local.startsWith(date)).reduce((s, a) => s + (a.icu_training_load ?? 0), 0);
    const planned = events
      .filter((e) => e.category === 'WORKOUT' && e.start_date_local.startsWith(date))
      .reduce((s, e) => s + workoutStats(parseWorkout(e.description ?? '')).load, 0);
    return { date, done, planned };
  });
  const max = Math.max(80, ...days.map((d) => Math.max(d.done, d.planned)));

  return (
    <section>
      <h2 className="section-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Cette semaine</span>
        <span className="tabular-nums" style={{ textTransform: 'none' }}>
          charge {formatLoad(totals.done)} / {formatLoad(totals.planned)}
        </span>
      </h2>
      <div className="card" role="img" aria-label={`Cette semaine : charge faite ${formatLoad(totals.done)} sur ${formatLoad(totals.planned)} prévue`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', alignItems: 'end', gap: 6, height: 64 }}>
          {days.map((d) =>
            d.done > 0 ? (
              <span
                key={d.date}
                style={{ height: Math.max(6, (d.done / max) * 64), borderRadius: 4, background: 'var(--green)', boxShadow: d.date === today ? '0 0 0 2px var(--cell), 0 0 0 3.5px var(--tint)' : undefined }}
              />
            ) : d.planned > 0 ? (
              <span key={d.date} style={{ height: Math.max(6, (d.planned / max) * 64), borderRadius: 4, border: '1.5px dashed var(--tint)' }} />
            ) : (
              <span key={d.date} style={{ height: 6, borderRadius: 3, background: 'var(--fill-2)' }} />
            ),
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 6, textAlign: 'center' }} className="caption secondary">
          {days.map((d) => (
            <span key={d.date} style={d.date === today ? { color: 'var(--tint)', fontWeight: 600 } : undefined}>
              {dayShort(d.date)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
