import { useState } from 'react';
import dayjs from 'dayjs';
import { Watch, Frown, Meh, Smile, Laugh, Angry, type LucideIcon } from 'lucide-react';
import { Page, Placeholder, Section, Cell } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { useSaveCheckin, useToday } from '@/hooks/useCoach';
import { formatDuration, formatKm, formColor, signed } from '@/lib/format';
import { METRIC_COLORS } from '@/theme';
import type { Checkin } from '@/types';

/** « mardi 24 novembre » → « Mardi 24 novembre » (CSS capitalize mettrait une capitale à chaque mot). */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ressenti : 1 = très mal … 5 = en pleine forme. */
const FEELINGS: Array<{ value: number; label: string; icon: LucideIcon; color: string }> = [
  { value: 1, label: 'Très mal', icon: Angry, color: 'var(--red)' },
  { value: 2, label: 'Fatigué', icon: Frown, color: 'var(--orange)' },
  { value: 3, label: 'Correct', icon: Meh, color: 'var(--yellow)' },
  { value: 4, label: 'Bien', icon: Smile, color: 'var(--green)' },
  { value: 5, label: 'En pleine forme', icon: Laugh, color: 'var(--teal)' },
];

/** Écran 8 : « Aujourd'hui » de l'athlète. */
export default function Today() {
  const { data, isLoading, error } = useToday();

  return (
    <Page title="Aujourd'hui" header={<p className="footnote secondary" style={{ margin: '-8px 0 12px' }}>{capitalize(dayjs().format('dddd D MMMM'))}</p>}>
      {isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}
      {error && <Placeholder title="Données indisponibles">{error.message}</Placeholder>}

      {data && (
        <>
          {data.workouts.length === 0 && data.activitiesToday.length === 0 && (
            <div className="card">
              <div className="headline">Pas de séance prévue</div>
              <div className="footnote secondary" style={{ marginTop: 4 }}>Journée libre : repos ou sortie à l'envie.</div>
            </div>
          )}
          {data.workouts.map((w) => (
            <div key={String(w.id ?? w.name)} className="card" style={{ background: 'color-mix(in srgb, var(--blue) 18%, var(--cell))', marginBottom: 10 }}>
              <div className="caption" style={{ color: 'var(--blue)' }}>De ton coach</div>
              <div className="title-2" style={{ marginTop: 2 }}>{w.name ?? 'Séance'}</div>
              {w.description && (
                <pre className="footnote" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '8px 0 0', color: 'var(--label-2)' }}>
                  {w.description}
                </pre>
              )}
              <div className="footnote" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: 'var(--label-2)' }}>
                <Watch size={16} aria-hidden /> Envoyée sur ta montre via Intervals.icu
              </div>
            </div>
          ))}
          {data.activitiesToday.map((a) => (
            <div key={a.id} className="card" style={{ marginBottom: 10 }}>
              <div className="caption" style={{ color: 'var(--green)' }}>Faite aujourd'hui</div>
              <div className="headline" style={{ marginTop: 2 }}>{a.name ?? 'Sortie'}</div>
              <div className="footnote secondary tabular-nums" style={{ marginTop: 2 }}>
                {formatDuration(a.moving_time)} · {formatKm(a.distance)}
                {a.icu_training_load != null ? ` · charge ${a.icu_training_load}` : ''}
              </div>
            </div>
          ))}

          <CheckinCard key={data.checkin?.day ?? 'none'} today={data.today} saved={data.checkin} />

          <Section header="Ma semaine">
            <div className="cell" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: 4 }}>
              {data.week.map((d) => (
                <WeekDay key={d.date} day={d} today={data.today} maxLoad={Math.max(80, ...data.week.map((x) => x.load))} />
              ))}
            </div>
          </Section>

          <Section header="Ma forme">
            <div className="cell" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <Metric label="Fitness" value={Math.round(data.form.fitness)} color={METRIC_COLORS.fitness} />
              <Metric label="Fatigue" value={Math.round(data.form.fatigue)} color={METRIC_COLORS.fatigue} />
              <Metric label="Forme" value={signed(data.form.form)} color={formColor(data.form.form)} />
            </div>
            <Cell to="/progres" title="Voir ma progression" />
          </Section>
        </>
      )}
    </Page>
  );
}

function CheckinCard({ today, saved }: { today: string; saved: Checkin | null }) {
  const save = useSaveCheckin();
  const [feeling, setFeeling] = useState<number | null>(saved?.feeling ?? null);
  const [rpe, setRpe] = useState<number | null>(saved?.rpe ?? null);
  const [note, setNote] = useState(saved?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const dirty = feeling !== (saved?.feeling ?? null) || rpe !== (saved?.rpe ?? null) || note !== (saved?.note ?? '');

  const submit = async () => {
    setError(null);
    if (feeling == null) return setError('Choisis comment tu te sens.');
    try {
      await save.mutateAsync({ day: today, feeling, rpe, note: note.trim() || null });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Section header="Comment tu te sens ?" footer={saved && !dirty ? 'Envoyé à ton coach.' : 'Ton coach le voit sur ta fiche.'}>
      <div className="cell" style={{ justifyContent: 'space-between' }} role="radiogroup" aria-label="Ressenti">
        {FEELINGS.map(({ value, label, icon: Icon, color }) => {
          const on = feeling === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              onPointerDown={() => setFeeling(value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFeeling(value)}
              className="pressable"
              style={{ width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', background: on ? `color-mix(in srgb, ${color} 22%, transparent)` : 'transparent', color: on ? color : 'var(--label-3)' }}
            >
              <Icon size={30} strokeWidth={1.8} />
            </button>
          );
        })}
      </div>
      <div className="cell" style={{ display: 'block' }}>
        <label htmlFor="rpe" className="footnote secondary" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Effort perçu de la sortie</span>
          <span className="tabular-nums" style={{ color: 'var(--label)' }}>{rpe == null ? '–' : `${rpe}/10`}</span>
        </label>
        <input id="rpe" type="range" min={1} max={10} step={1} value={rpe ?? 5} onChange={(e) => setRpe(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--tint)' }} />
      </div>
      <textarea
        className="field"
        aria-label="Un mot pour ton coach"
        placeholder="Un mot pour ton coach (sommeil, douleur, motivation…)"
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ minHeight: 72, fontFamily: 'inherit', fontSize: 15, borderTop: '0.5px solid var(--separator)' }}
      />
      {(dirty || !saved) && (
        <button type="button" className="cell" onClick={submit} disabled={save.isPending} style={{ color: 'var(--tint)', fontWeight: 600, justifyContent: 'center' }}>
          {save.isPending ? 'Envoi…' : 'Envoyer'}
        </button>
      )}
      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: 0, padding: '0 16px 12px' }}>
          {error}
        </p>
      )}
    </Section>
  );
}

function WeekDay({ day, today, maxLoad }: { day: { date: string; planned: string[]; load: number; done: boolean }; today: string; maxLoad: number }) {
  const isToday = day.date === today;
  const past = day.date < today;
  const missed = past && day.planned.length > 0 && !day.done;
  const h = day.done ? Math.max(6, Math.round((day.load / maxLoad) * 44)) : 4;
  const label = `${dayjs(day.date).format('dddd')} : ${day.done ? `faite, charge ${day.load}` : missed ? 'séance manquée' : day.planned.length ? `prévu ${day.planned.join(', ')}` : 'repos'}`;
  return (
    <div aria-label={label} role="img">
      <div style={{ height: 48, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {day.planned.length > 0 && !day.done && !past ? (
          <div style={{ width: 14, height: 24, borderRadius: 4, border: '1.5px dashed var(--tint)' }} />
        ) : (
          <div style={{ width: 14, height: h, borderRadius: 4, background: day.done ? 'var(--green)' : missed ? 'var(--red)' : 'var(--fill-2)' }} />
        )}
      </div>
      <div className="caption" style={{ marginTop: 4, color: isToday ? 'var(--tint)' : 'var(--label-2)', fontWeight: isToday ? 600 : 400 }}>
        {dayjs(day.date).format('dd').slice(0, 1).toUpperCase()}
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div className="caption secondary">{label}</div>
      <div className="metric" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
