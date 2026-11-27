import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ios';
import { useAthleteSports } from '@/hooks/useTrends';
import { formatCount, sharesLabel, sportShares, totalCount, type SportCount, type SportShare } from '@/lib/sportShare';
import type { TeamSportsView } from '@/services/trendsApi';

/**
 * Répartition des sports pratiqués sur 4 semaines : nombre de sorties par sport (vélo,
 * natation, course, autre). Barres CSS simples, sans recharts : utilisable
 * sur n'importe quelle page. Chaque part est aussi écrite en clair (légende).
 */

/** Barre empilée à 100 %, segments séparés de 2 px, bouts arrondis. */
export function SportBar({ shares, height = 10 }: { shares: SportShare[]; height?: number }) {
  return (
    <div role="img" aria-label={sharesLabel(shares)} style={{ display: 'flex', gap: shares.length > 1 ? 2 : 0, height, borderRadius: height / 2, overflow: 'hidden', background: 'var(--fill)' }}>
      {shares.map((s) => (
        <span key={s.key} title={`${s.label} : ${formatCount(s.count)} (${s.percent} %)`} style={{ flex: `${s.count} 0 0`, minWidth: 3, background: s.color }} />
      ))}
    </div>
  );
}

/** Légende : chaque sport avec son nombre de sorties et sa part (l'identité ne repose jamais sur la couleur seule). */
export function SportLegend({ shares }: { shares: SportShare[] }) {
  return (
    <ul className="footnote tabular-nums" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px 12px' }}>
      {shares.map((s) => (
        <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: 'none' }} />
          <span>{s.label}</span>
          <span className="secondary" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {formatCount(s.count)} · {s.percent} %
          </span>
        </li>
      ))}
    </ul>
  );
}

function Heading({ total }: { total: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
      <h2 className="headline" style={{ margin: 0 }}>
        Sports · 4 semaines
      </h2>
      {total != null && <span className="footnote secondary tabular-nums">{formatCount(total)} au total</span>}
    </div>
  );
}

/** Carte de la fiche athlète (coach) et de « Progrès » (athlète). */
export function AthleteSportsCard({ athleteId }: { athleteId: string }) {
  const q = useAthleteSports(athleteId);
  if (q.isLoading) {
    return (
      <div className="card" aria-busy="true">
        <Heading total={null} />
        <Skeleton height={10} />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="card">
        <Heading total={null} />
        <p className="footnote secondary" style={{ margin: 0 }}>Répartition indisponible{q.error ? ` : ${q.error.message}` : ''}</p>
      </div>
    );
  }
  const shares = sportShares(q.data.count);
  return (
    <div className="card">
      <Heading total={totalCount(q.data.count)} />
      {shares.length === 0 ? (
        <p className="footnote secondary" style={{ margin: 0 }}>Aucune sortie sur les 4 dernières semaines.</p>
      ) : (
        <>
          <SportBar shares={shares} />
          <SportLegend shares={shares} />
        </>
      )}
    </div>
  );
}

/** Vue d'équipe : sorties par sport, puis une barre par athlète. */
export function TeamSports({ data }: { data: TeamSportsView }) {
  const team = sportShares(data.team);
  const rows = [...data.athletes].sort((a, b) => totalCount(b.count) - totalCount(a.count) || a.name.localeCompare(b.name, 'fr'));
  return (
    <>
      <div className="card">
        <Heading total={totalCount(data.team)} />
        {team.length === 0 ? (
          <p className="footnote secondary" style={{ margin: 0 }}>Aucune sortie sur les 4 dernières semaines.</p>
        ) : (
          <>
            <SportBar shares={team} />
            <SportLegend shares={team} />
          </>
        )}
      </div>
      {rows.length > 0 && (
        <ul aria-label="Sports de chaque athlète" className="card" style={{ listStyle: 'none', padding: '4px 16px' }}>
          {rows.map((a) => (
            <AthleteRow key={a.id} id={a.id} name={a.name} count={a.count} />
          ))}
        </ul>
      )}
    </>
  );
}

function AthleteRow({ id, name, count }: { id: string; name: string; count: SportCount }) {
  const shares = sportShares(count);
  const total = totalCount(count);
  return (
    <li style={{ padding: '10px 0', borderBottom: '0.5px solid var(--separator)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <Link to={`/athletes/${encodeURIComponent(id)}`} style={{ color: 'var(--label)', fontWeight: 600, minHeight: 24 }}>
          {name}
        </Link>
        <span className="footnote secondary tabular-nums">{total > 0 ? formatCount(total) : 'Aucune sortie'}</span>
      </div>
      {shares.length > 0 && <SportBar shares={shares} height={8} />}
    </li>
  );
}
