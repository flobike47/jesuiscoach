import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ios';
import { useWeekReview } from '@/hooks/useWeekReview';
import { formatLoad } from '@/lib/format';
import { attentionReason, lastWeekRange, needsAttention, weekLabel, type WeekReview } from '@/lib/weekReview';

/** Les trois chiffres de la semaine : charge faite / prévue, séances manquées, athlètes au-dessus de l'habitude. */
export function WeekTotals({ totals }: { totals: WeekReview['totals'] }) {
  // Aucune séance estimable (démo, séances sans structure) : on n'affiche pas « 0 » prévu.
  const showPlanned = totals.sessions > 0 && totals.unestimated < totals.sessions;
  const caption =
    totals.sessions === 0
      ? 'charge faite · rien de prévu'
      : !showPlanned
        ? 'charge faite · prévue non estimée'
        : `charge faite / prévue${totals.unestimated ? ` (+${totals.unestimated} non estimée${totals.unestimated > 1 ? 's' : ''})` : ''}`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
      <div>
        <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700 }}>
          {formatLoad(totals.done)}
          {showPlanned && (
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--label-2)' }}> / {formatLoad(totals.planned)}</span>
          )}
        </div>
        <div className="footnote secondary">{caption}</div>
      </div>
      <div>
        <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: totals.missed ? 'var(--red)' : undefined }}>
          {totals.missed}
        </div>
        <div className="footnote secondary">{totals.missed > 1 ? 'séances manquées' : 'séance manquée'}</div>
      </div>
      <div>
        <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: totals.overUsual ? 'var(--orange)' : undefined }}>
          {totals.overUsual}
        </div>
        <div className="footnote secondary">au-dessus de l'habitude</div>
      </div>
    </div>
  );
}

/**
 * Carte « Semaine écoulée » de l'accueil du coach : le bilan du lundi matin,
 * en un coup d'œil, avec accès au détail par athlète.
 */
export function WeekReviewCard({ today }: { today: string }) {
  const { from, to } = lastWeekRange(today);
  const { data, isLoading, error } = useWeekReview(from, to, today);

  if (isLoading) {
    return (
      <section aria-label="Semaine écoulée" style={{ marginBottom: 16 }}>
        <h2 className="section-header">Semaine écoulée</h2>
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="80%" height={14} />
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section aria-label="Semaine écoulée" style={{ marginBottom: 16 }}>
        <h2 className="section-header">Semaine écoulée</h2>
        <p className="footnote secondary" style={{ margin: '0 4px' }}>
          Résumé indisponible : {error.message}
        </p>
      </section>
    );
  }
  if (!data || data.athletes.length === 0) return null;

  const attention = data.athletes.filter(needsAttention);
  return (
    <section aria-label="Semaine écoulée" style={{ marginBottom: 16 }}>
      <h2 className="section-header">Semaine écoulée · {weekLabel(from, to)}</h2>
      <Link to="/semaine" className="card pressable" aria-label={`Résumé de la semaine du ${weekLabel(from, to)} : voir le détail`} style={{ display: 'grid', gap: 12, color: 'inherit', textDecoration: 'none' }}>
        <WeekTotals totals={data.totals} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, color: 'var(--label-2)' }}>
            {attention.length === 0
              ? 'Rien à signaler : semaine conforme au plan.'
              : attention
                  .slice(0, 3)
                  .map((a) => `${a.name} : ${attentionReason(a)}`)
                  .join(' — ') + (attention.length > 3 ? ` — et ${attention.length - 3} autre${attention.length > 4 ? 's' : ''}` : '')}
          </div>
          <ChevronRight size={18} className="chevron" aria-hidden />
        </div>
      </Link>
    </section>
  );
}
