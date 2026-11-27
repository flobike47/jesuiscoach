import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { parseWorkout, workoutStats, type Sport } from '@/lib/workout';
import { formatDuration, formatLoad } from '@/lib/format';
import { textToBlocks } from '@/lib/workoutBlocks';
import { WorkoutProfile } from './StructureEditor';
import { summarizeBlocks } from '@/lib/workoutSummary';
import { compareBlocks } from '@/lib/blockCompare';
import { useActivityDetail } from '@/hooks/useCoach';

export interface TodayCardProps {
  /** Séance prévue. */
  workout: {
    id?: number | string;
    name?: string;
    description?: string;
  };
  /** Sortie du jour correspondante, ou null. */
  activity?: {
    id: string;
    name?: string;
    start_date_local: string;
    moving_time?: number | null;
    icu_training_load?: number | null;
    icu_weighted_avg_watts?: number | null;
  };
  /** FTP pour convertir % en watts. */
  ftp: number | null;
  /** Sport de la séance (Ride par défaut). */
  sport?: Sport;
  /** Athlète (lien vers le détail de la sortie et intervalles). */
  athleteId?: string;
}

/** Carte « Séance du jour » : avant la sortie (bleu) ou après (vert). */
export function TodayWorkoutCard({ workout, activity, ftp, sport = 'Ride', athleteId }: TodayCardProps) {
  // Intervalles de la sortie (cache longue durée) pour comparer bloc par bloc.
  const detail = useActivityDetail(athleteId, activity?.id);
  const comparison = detail.data ? compareBlocks(parseWorkout(workout.description ?? ''), ftp, detail.data.intervals) : null;
  const steps = parseWorkout(workout.description ?? '');
  const stats = workoutStats(steps);

  // Utilise les blocs pour préserver la structure des répétitions
  const blocks = textToBlocks(workout.description ?? '');
  const blockSummaries = summarizeBlocks(blocks, ftp);

  const lines = (workout.description ?? '').split('\n');
  // Mot du coach : les phrases de la description qui ne sont ni des paliers ni des titres de bloc.
  const coachWords = lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('-') && !/^\d+\s*x$/i.test(l) && l.split(/\s+/).length >= 4)
    .join('\n');

  const done = Boolean(activity);
  const bgColor = done ? 'color-mix(in srgb, var(--green) 18%, var(--cell))' : 'color-mix(in srgb, var(--blue) 18%, var(--cell))';
  const headerColor = done ? 'var(--green)' : 'var(--blue)';

  return (
    <article className="card" style={{ background: bgColor, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="caption" style={{ color: headerColor }}>
          {done ? (
            <>
              <Check size={13} strokeWidth={3} aria-hidden style={{ marginRight: 4, display: 'inline' }} />
              Séance faite
              {activity?.start_date_local && (
                <>
                  {' '}
                  à{' '}
                  {new Date(activity.start_date_local).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </>
              )}
            </>
          ) : (
            <>
              Séance du jour · de ton coach
              <Check size={13} strokeWidth={3} aria-hidden style={{ marginLeft: 'auto', marginRight: 0, color: 'var(--green)' }} />
              <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>Sur ta montre</span>
            </>
          )}
        </div>
        {done && activity && athleteId && (
          <Link to={`/athletes/${encodeURIComponent(athleteId ?? '')}/sorties/${encodeURIComponent(activity.id)}`} style={{ fontSize: 15, color: 'var(--tint)' }}>
            Détail
          </Link>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <h2 className="title-2" style={{ marginBottom: 2 }}>
          {workout.name ?? 'Séance'}
        </h2>
        <div className="footnote secondary" style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {done && activity ? (
            <>
              {activity.moving_time && <>{formatDuration(activity.moving_time)} · </>}
              {activity.icu_training_load && <>charge {formatLoad(activity.icu_training_load)}</>}
            </>
          ) : (
            <>
              {stats.complete && (
                <>
                  {formatDuration(stats.seconds)} · charge {stats.load}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {!done && (
        <>
          {/* Profil de la séance en grand */}
          <div style={{ height: 64, marginBottom: 12 }}>
            <WorkoutProfile steps={steps} sport={sport} height={64} />
          </div>

          {/* Blocs de la séance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {blockSummaries.map((block, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 10, alignItems: 'center' }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: block.zoneColor,
                  }}
                  aria-hidden
                />
                <div style={{ fontSize: 15 }}>{block.label}</div>
                <div
                  className="footnote secondary"
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {block.target}
                </div>
              </div>
            ))}
          </div>

          {/* Mot du coach */}
          {coachWords && (
            <div style={{ background: 'var(--fill)', borderRadius: 12, padding: '10px 12px', fontSize: 15, lineHeight: 1.4, marginBottom: 12 }}>
              <div className="footnote secondary" style={{ marginBottom: 2 }}>
                Mot du coach
              </div>
              <div>{coachWords}</div>
            </div>
          )}
        </>
      )}

      {done && comparison && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 10 }} role="img" aria-label={comparison.summary}>
            {comparison.blocks.map((b, i) => {
              // Échelle : cible au milieu, ±25 % autour.
              const lo = b.target[0] * 0.75;
              const hi = b.target[1] * 1.25;
              const y = (w: number) => `${100 - ((Math.min(hi, Math.max(lo, w)) - lo) / (hi - lo)) * 100}%`;
              return (
                <div key={i} style={{ flex: 1, display: 'grid', gap: 4, justifyItems: 'center' }}>
                  <div style={{ position: 'relative', width: '100%', height: 54, borderRadius: 6, background: 'var(--fill)' }}>
                    <span style={{ position: 'absolute', left: 0, right: 0, top: y(b.target[1]), bottom: `calc(100% - ${y(b.target[0])})`, background: 'color-mix(in srgb, var(--yellow) 28%, transparent)', borderTop: '1px dashed var(--yellow)', borderBottom: '1px dashed var(--yellow)' }} />
                    <span style={{ position: 'absolute', left: 8, right: 8, top: `calc(${y(b.actual)} - 2px)`, height: 4, borderRadius: 2, background: b.ok ? 'var(--label)' : 'var(--orange)' }} />
                  </div>
                  <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: b.ok ? undefined : 'var(--orange)' }}>
                    {b.actual} W
                  </span>
                </div>
              );
            })}
          </div>
          <p className="footnote" style={{ margin: '8px 0 0', color: 'var(--label-2)' }}>{comparison.summary}</p>
        </div>
      )}

      {done && (
        <>
          {/* Tableau comparatif après la sortie */}
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 76px 76px',
                gap: 8,
                fontSize: 12,
                color: 'var(--label-2)',
                fontVariantNumeric: 'tabular-nums',
                paddingBottom: 2,
                borderBottom: '0.5px solid var(--separator)',
              }}
            >
              <span></span>
              <span style={{ textAlign: 'right' }}>Prévu</span>
              <span style={{ textAlign: 'right' }}>Fait</span>
            </div>

            {/* Durée */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 76px 76px',
                gap: 8,
                fontSize: 15,
                fontVariantNumeric: 'tabular-nums',
                paddingTop: 9,
                paddingBottom: 9,
                borderBottom: '0.5px solid var(--separator)',
              }}
            >
              <span>Durée</span>
              <span style={{ textAlign: 'right', color: 'var(--label-2)' }}>
                {stats.complete ? formatDuration(stats.seconds) : '–'}
              </span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>
                {activity?.moving_time ? formatDuration(activity.moving_time) : '–'}
              </span>
            </div>

            {/* Charge */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 76px 76px',
                gap: 8,
                fontSize: 15,
                fontVariantNumeric: 'tabular-nums',
                paddingTop: 9,
                paddingBottom: 9,
                borderBottom: '0.5px solid var(--separator)',
              }}
            >
              <span>Charge</span>
              <span style={{ textAlign: 'right', color: 'var(--label-2)' }}>
                {stats.complete ? stats.load : '–'}
              </span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>
                {activity?.icu_training_load ? formatLoad(activity.icu_training_load) : '–'}
              </span>
            </div>

            {/* Puissance pondérée */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 76px 76px',
                gap: 8,
                fontSize: 15,
                fontVariantNumeric: 'tabular-nums',
                paddingTop: 9,
              }}
            >
              <span>Puissance pondérée</span>
              <span style={{ textAlign: 'right', color: 'var(--label-2)' }}>
                {ftp ? `${Math.round(stats.intensity * ftp)} W` : '–'}
              </span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>
                {activity?.icu_weighted_avg_watts ? `${activity.icu_weighted_avg_watts} W` : '–'}
              </span>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
