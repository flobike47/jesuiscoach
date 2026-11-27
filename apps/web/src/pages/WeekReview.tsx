import { useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar, Cell, Page, Placeholder, Section, SkeletonList } from '@/components/ios';
import { WeekTotals } from '@/components/coach/WeekReviewCard';
import { useWeekReview } from '@/hooks/useWeekReview';
import { formatLoad } from '@/lib/format';
import { attentionReason, plannedLabel, lastWeekRange, mondayOf, needsAttention, shiftWeek, weekLabel, weekRange, type AthleteWeekReview } from '@/lib/weekReview';

/** Charge d'un athlète en une ligne : « Charge 65 / 140 prévue · habituelle 300 ». */
function loadLine(a: AthleteWeekReview): string {
  const planned = plannedLabel(a);
  const usual = a.usual != null ? ` · habituelle ${formatLoad(a.usual)}` : '';
  return `Charge ${formatLoad(a.done)} / ${planned}${usual}`;
}

function AthleteRow({ a }: { a: AthleteWeekReview }) {
  const sessions = a.sessions ? `${a.sessionsDone}/${a.sessions} séances` : null;
  return (
    <Cell
      to={`/calendrier?athlete=${encodeURIComponent(a.id)}`}
      leading={<Avatar name={a.name} />}
      inset={64}
      title={a.name}
      subtitle={a.error ? `Lecture impossible : ${a.error}` : [loadLine(a), needsAttention(a) ? attentionReason(a) : null].filter(Boolean).join(' — ')}
      detail={!a.error && sessions ? <span className="tabular-nums">{sessions}</span> : undefined}
    />
  );
}

/**
 * Résumé de la semaine du coach : bilan par athlète (charge prévue / faite,
 * séances manquées, charge au-dessus de l'habitude). Par défaut la semaine
 * écoulée ; on remonte ou avance semaine par semaine.
 */
export default function WeekReview() {
  const today = dayjs().format('YYYY-MM-DD');
  const lastMonday = lastWeekRange(today).from;
  const [monday, setMonday] = useState(lastMonday);
  const { from, to } = weekRange(monday);
  const { data, isLoading, error, refetch } = useWeekReview(from, to, today);
  const currentMonday = mondayOf(today);
  const caption = monday === lastMonday ? 'Semaine écoulée' : monday === currentMonday ? 'Semaine en cours' : null;

  const attention = data?.athletes.filter(needsAttention) ?? [];
  const others = data?.athletes.filter((a) => !needsAttention(a)) ?? [];

  return (
    <Page title="Résumé de la semaine" back={{ to: '/', label: "Aujourd'hui" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 12px' }}>
        <button type="button" aria-label="Semaine précédente" onClick={() => setMonday((m) => shiftWeek(m, -1))} style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}>
          <ChevronLeft size={24} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="headline">{weekLabel(from, to)}</div>
          {caption && <div className="footnote secondary">{caption}</div>}
        </div>
        <button
          type="button"
          aria-label="Semaine suivante"
          disabled={monday >= currentMonday}
          onClick={() => setMonday((m) => shiftWeek(m, 1))}
          style={{ color: monday >= currentMonday ? 'var(--label-3)' : 'var(--tint)', minWidth: 44, minHeight: 44 }}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {isLoading && <SkeletonList rows={5} />}
      {error && (
        <Placeholder title="Résumé indisponible" action={<button type="button" className="button tinted pressable" onClick={() => refetch()}>Réessayer</button>}>
          {error.message}
        </Placeholder>
      )}

      {data && data.athletes.length === 0 && <Placeholder title="Aucun athlète">Le résumé apparaîtra dès qu'un athlète aura rejoint ton équipe.</Placeholder>}

      {data && data.athletes.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 8 }}>
            <WeekTotals totals={data.totals} />
          </div>
          {data.totals.unavailable > 0 && (
            <p className="footnote secondary" style={{ margin: '0 4px 8px' }}>
              {data.totals.unavailable > 1 ? `${data.totals.unavailable} athlètes illisibles, hors totaux.` : '1 athlète illisible, hors totaux.'}
            </p>
          )}
          {attention.length > 0 && (
            <Section header={`À suivre · ${attention.length}`} footer="Au-dessus de l'habitude : charge faite plus de 15 % au-dessus de la moyenne des 4 semaines précédentes.">
              {attention.map((a) => (
                <AthleteRow key={a.id} a={a} />
              ))}
            </Section>
          )}
          {others.length > 0 && (
            <Section header={attention.length ? 'Les autres' : 'Toute l’équipe'}>
              {others.map((a) => (
                <AthleteRow key={a.id} a={a} />
              ))}
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
