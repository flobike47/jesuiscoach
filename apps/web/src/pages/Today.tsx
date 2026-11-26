import { useState } from 'react';
import dayjs from 'dayjs';
import { Frown, Meh, Smile, Laugh, Angry, type LucideIcon, Check, Circle, X } from 'lucide-react';
import { Page, Placeholder, Section, Cell, FormGauge, SkeletonList } from '@/components/ios';
import { useSaveCheckin, useToday } from '@/hooks/useCoach';
import { formatDuration, formatLoad, dayShort } from '@/lib/format';
import { TodayWorkoutCard } from '@/components/workout/TodayCard';
import type { Checkin } from '@/types';

/** « mardi 24 novembre » → « Mardi 24 novembre » (CSS capitalize mettrait une capitale à chaque mot). */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ressenti : 1 = très mal … 5 = en pleine forme. */
const FEELINGS: Array<{ value: number; label: string; icon: LucideIcon; color: string }> = [
  { value: 1, label: 'Épuisé·e', icon: Angry, color: 'var(--red)' },
  { value: 2, label: 'Fatigué·e', icon: Frown, color: 'var(--orange)' },
  { value: 3, label: 'Correct', icon: Meh, color: 'var(--yellow)' },
  { value: 4, label: 'Bien', icon: Smile, color: 'var(--green)' },
  { value: 5, label: 'En forme', icon: Laugh, color: 'var(--teal)' },
];

/** Libellés pour l'effort perçu (RPE). */
const RPE_LABELS: Record<number, string> = {
  1: 'Très facile',
  2: 'Très facile',
  3: 'Facile',
  4: 'Facile',
  5: 'Modéré',
  6: 'Modéré',
  7: 'Dur',
  8: 'Dur',
  9: 'Très dur',
  10: 'Maximal',
};

/** Écran 8 : « Aujourd'hui » de l'athlète. */
export default function Today() {
  const { data, isLoading, error } = useToday();

  return (
    <Page title="Aujourd'hui" header={<p className="footnote secondary" style={{ margin: '-8px 0 12px' }}>{capitalize(dayjs().format('dddd D MMMM'))}</p>}>
      {isLoading && <SkeletonList rows={4} avatar={false} />}
      {error && <Placeholder title="Données indisponibles">{error.message}</Placeholder>}

      {data && (
        <>
          {data.workouts.length === 0 && data.activitiesToday.length === 0 && (
            <div className="card">
              <div className="headline">Pas de séance prévue</div>
              <div className="footnote secondary" style={{ marginTop: 4 }}>Journée libre : repos ou sortie à l'envie.</div>
            </div>
          )}

          {/* Carte séance du jour (ou libre sans séance) */}
          {data.workouts.length > 0 && (
            <TodayWorkoutCard
              workout={data.workouts[0]}
              activity={data.activitiesToday.length > 0 ? data.activitiesToday[0] : undefined}
              ftp={data.ftp}
              sport="Ride"
            />
          )}

          {/* Sortie libre sans séance prévue */}
          {data.workouts.length === 0 && data.activitiesToday.length > 0 && (
            <div
              className="card"
              style={{
                background: 'color-mix(in srgb, var(--green) 18%, var(--cell))',
                marginBottom: 12,
              }}
            >
              <div className="caption" style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={13} strokeWidth={3} aria-hidden /> Sortie libre
              </div>
              <div className="title-2" style={{ marginTop: 6, marginBottom: 6 }}>
                {data.activitiesToday[0].name ?? 'Sortie'}
              </div>
              <div className="footnote secondary tabular-nums">
                {data.activitiesToday[0].moving_time && <>Durée {formatDuration(data.activitiesToday[0].moving_time)}</>}
                {data.activitiesToday[0].icu_training_load && <> · Charge {formatLoad(data.activitiesToday[0].icu_training_load)}</>}
              </div>
            </div>
          )}

          <CheckinCard
            key={data.checkin?.day ?? 'none'}
            today={data.today}
            saved={data.checkin}
            hasActivity={data.activitiesToday.length > 0}
          />

          {/* Demain */}
          {data.tomorrow.length > 0 && (
            <Section header="Demain">
              {data.tomorrow.map((w) => (
                <div
                  key={String(w.id ?? w.name)}
                  className="cell"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 22, width: 56 }} aria-hidden="true">
                    <span
                      style={{
                        flex: 1,
                        height: 9,
                        background: 'var(--gray)',
                        borderRadius: '1.5px',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15 }}>{w.name ?? 'Séance'}</div>
                    <div className="footnote secondary">charge – · durée –</div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          <Section header="Ma forme">
            <div className="card">
              <FormGauge form={data.form.form} fitness={data.form.fitness} fatigue={data.form.fatigue} audience="athlete" />
            </div>
            <Cell to="/progres" title="Voir ma progression" />
          </Section>

          <Section header="Ma semaine">
            <div className="cell" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: 4 }}>
              {data.week.map((d) => (
                <WeekDay key={d.date} day={d} today={data.today} />
              ))}
            </div>
          </Section>
        </>
      )}
    </Page>
  );
}

export function CheckinCard({ today, saved, hasActivity }: { today: string; saved: Checkin | null; hasActivity: boolean }) {
  const save = useSaveCheckin();
  const [feeling, setFeeling] = useState<number | null>(saved?.feeling ?? null);
  const [rpe, setRpe] = useState<number | null>(saved?.rpe ?? null);
  const [note, setNote] = useState(saved?.note ?? '');
  const [noteOpen, setNoteOpen] = useState(Boolean(saved?.note));
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

  const header = hasActivity ? "Comment c'était ?" : 'Comment tu te sens ce matin ?';
  const footer = saved && !dirty ? 'Envoyé à ton coach.' : undefined;

  return (
    <Section header={header} footer={footer}>
      {/* Visages avec libellés visibles */}
      <div className="cell" style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start' }}>
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
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                minWidth: 56,
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: on ? `color-mix(in srgb, ${color} 22%, transparent)` : 'var(--fill)',
                  color: on ? color : 'var(--label-3)',
                  boxShadow: on ? `inset 0 0 0 2px ${color}` : 'none',
                }}
              >
                <Icon size={26} strokeWidth={1.8} aria-hidden />
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: on ? color : 'var(--label-2)',
                  fontWeight: on ? 600 : 400,
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Effort perçu (seulement s'il y a une sortie) */}
      {hasActivity && (
        <>
          <div className="cell" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>Effort perçu</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: rpe ? 'var(--label)' : 'var(--label-2)', fontVariantNumeric: 'tabular-nums' }}>
              {rpe ? `${rpe} · ${RPE_LABELS[rpe]}` : '–'}
            </span>
          </div>
          <div
            className="cell"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
              gap: 4,
              padding: '10px 16px',
            }}
            role="radiogroup"
            aria-label="Effort perçu de 1 à 10"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rpe === value}
                onPointerDown={() => setRpe(value)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setRpe(value)}
                className="pressable"
                style={{
                  minHeight: 44,
                  borderRadius: 10,
                  background: rpe === value ? 'var(--orange)' : 'var(--fill)',
                  color: rpe === value ? 'var(--label)' : 'var(--label-2)',
                  fontWeight: 600,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="cell" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--label-2)', padding: '10px 16px' }}>
            <span>Très facile</span>
            <span>Maximal</span>
          </div>
        </>
      )}

      {/* Note repliée derrière lien ou dépliée si elle existe */}
      {hasActivity && (
        <div className="cell" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!noteOpen && (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--tint)',
                cursor: 'pointer',
                fontSize: 15,
                textAlign: 'left',
                padding: 0,
              }}
            >
              {note ? 'Modifier un mot' : 'Ajouter un mot'}
            </button>
          )}
          {noteOpen && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '0.5px solid var(--separator)', paddingTop: 12 }}>
              <span className="footnote secondary">Un mot pour ton coach</span>
              <textarea
                aria-label="Un mot pour ton coach"
                placeholder="Sommeil, douleur, motivation…"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ minHeight: 72, fontFamily: 'inherit', fontSize: 15, background: 'var(--fill)', borderRadius: 10, border: 'none', padding: '10px 12px', resize: 'none' }}
              />
            </label>
          )}
        </div>
      )}

      {(dirty || !saved) && (
        <button
          type="button"
          className="cell"
          onClick={submit}
          disabled={save.isPending}
          style={{ color: 'var(--tint)', fontWeight: 600, justifyContent: 'center', minHeight: 48 }}
        >
          {save.isPending ? 'Envoi…' : 'Envoyer à ton coach'}
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

function WeekDay({ day, today }: { day: { date: string; planned: string[]; load: number; done: boolean }; today: string }) {
  const isToday = day.date === today;
  const past = day.date < today;
  const missed = past && day.planned.length > 0 && !day.done;
  const isFuture = day.date > today;
  const hasPlanned = day.planned.length > 0;
  const isRest = day.planned.length === 0 && !day.done;

  let icon: React.ReactNode = null;
  let iconColor = 'var(--label-2)';
  let label = '';

  if (day.done) {
    icon = <Check size={18} strokeWidth={3} aria-hidden />;
    iconColor = 'var(--green)';
    label = `${dayjs(day.date).format('dddd')} : faite, charge ${day.load}`;
  } else if (missed) {
    icon = <X size={18} strokeWidth={3} aria-hidden />;
    iconColor = 'var(--red)';
    label = `${dayjs(day.date).format('dddd')} : séance manquée`;
  } else if (hasPlanned && isFuture) {
    icon = <Circle size={18} strokeWidth={2.4} style={{ strokeDasharray: '3 3' }} aria-hidden />;
    iconColor = 'var(--blue)';
    label = `${dayjs(day.date).format('dddd')} : prévue`;
  } else if (hasPlanned) {
    icon = <Circle size={18} strokeWidth={3} aria-hidden />;
    iconColor = 'var(--blue)';
    label = `${dayjs(day.date).format('dddd')} : prévue`;
  } else if (isRest) {
    icon = <span style={{ width: 14, height: 2, background: 'var(--label-2)', borderRadius: 1 }} aria-hidden />;
    iconColor = 'var(--label-2)';
    label = `${dayjs(day.date).format('dddd')} : repos`;
  }

  return (
    <div aria-label={label} role="img" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ height: 24, display: 'grid', placeItems: 'center', color: isToday ? 'var(--tint)' : iconColor }}>
        {icon}
      </div>
      <div
        className="caption"
        style={{
          color: isToday ? 'var(--tint)' : 'var(--label-2)',
          fontWeight: isToday ? 600 : 400,
        }}
      >
        {dayShort(day.date)}
      </div>
    </div>
  );
}
