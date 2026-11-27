import { useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { METRIC_COLORS } from '@/theme';
import { formatChange, sampleAt, sharedMax, sparkPath, trendOf, valueDaysBefore, type AthleteFitness } from '@/lib/teamFitness';

/**
 * Fitness du groupe en petits multiples : une courbe par athlète, côte à
 * côte, toutes à la même échelle (0 → maximum du groupe). SVG simple, sans
 * recharts. Toucher ou survoler une courbe affiche la valeur du jour.
 */

const W = 160;
const H = 48;

export function TeamFitnessGrid({ athletes }: { athletes: AthleteFitness[] }) {
  const max = sharedMax(athletes);
  return (
    <>
      <ul
        aria-label="Fitness de chaque athlète"
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}
      >
        {athletes.map((a) => (
          <SparkCard key={a.id} athlete={a} max={max} />
        ))}
      </ul>
      <p className="caption secondary" style={{ margin: '8px 4px 0' }}>
        Même échelle pour tous : de 0 à {max}.
      </p>
      <FitnessTable athletes={athletes} />
    </>
  );
}

function SparkCard({ athlete, max }: { athlete: AthleteFitness; max: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const trend = trendOf(athlete.series);
  const n = athlete.series.length;
  const picked = hover != null ? athlete.series[hover] : null;

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    setHover(sampleAt(athlete.series, (e.clientX - rect.left) / rect.width)?.index ?? null);
  };

  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : 0);
  const label = trend
    ? `${athlete.name} : fitness ${Math.round(trend.latest.fitness)}, ${formatChange(trend.change)} depuis le ${dayjs(trend.first.date).format('D MMMM')}`
    : `${athlete.name} : pas de données`;

  return (
    <li className="card" style={{ margin: 0, padding: 12 }}>
      <Link to={`/athletes/${encodeURIComponent(athlete.id)}`} style={{ color: 'var(--label)', fontWeight: 600, display: 'block', minHeight: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {athlete.name}
      </Link>
      <div className="tabular-nums" style={{ display: 'flex', alignItems: 'baseline', gap: 6, minHeight: 28 }} aria-live="polite">
        {picked ? (
          <>
            <span className="metric" style={{ fontSize: 22 }}>{Math.round(picked.fitness)}</span>
            <span className="caption secondary">{dayjs(picked.date).format('D MMM')}</span>
          </>
        ) : trend ? (
          <>
            <span className="metric" style={{ fontSize: 22 }}>{Math.round(trend.latest.fitness)}</span>
            <span className="caption secondary">{formatChange(trend.change)} en {Math.max(1, n - 1)} j</span>
          </>
        ) : (
          <span className="caption secondary">Pas de données</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        width="100%"
        height={H}
        style={{ display: 'block', marginTop: 6, overflow: 'visible', touchAction: 'pan-y' }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
        onPointerCancel={() => setHover(null)}
      >
        <line x1={0} x2={W} y1={H} y2={H} stroke="var(--separator)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--separator)" strokeDasharray="2 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={sparkPath(athlete.series, W, H, max)} fill="none" stroke={METRIC_COLORS.fitness} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {picked && hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--label-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    </li>
  );
}

/** Mêmes chiffres en tableau (lecteurs d'écran, lecture précise). */
function FitnessTable({ athletes }: { athletes: AthleteFitness[] }) {
  const cell = { padding: '6px 4px', textAlign: 'right' as const };
  return (
    <details style={{ margin: '8px 4px 0' }}>
      <summary className="footnote" style={{ color: 'var(--tint)', minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
        Voir les valeurs
      </summary>
      <table className="footnote tabular-nums" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr className="secondary">
            <th scope="col" style={{ ...cell, textAlign: 'left' }}>Athlète</th>
            <th scope="col" style={cell}>Il y a 90 j</th>
            <th scope="col" style={cell}>Il y a 30 j</th>
            <th scope="col" style={cell}>Aujourd’hui</th>
          </tr>
        </thead>
        <tbody>
          {athletes.map((a) => {
            const v = (d: number) => {
              const x = valueDaysBefore(a.series, d);
              return x == null ? '–' : Math.round(x);
            };
            return (
              <tr key={a.id} style={{ borderTop: '0.5px solid var(--separator)' }}>
                <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 400 }}>{a.name}</th>
                <td style={cell}>{v(90)}</td>
                <td style={cell}>{v(30)}</td>
                <td style={cell}>{v(0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
