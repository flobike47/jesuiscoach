import { useMemo } from 'react';
import dayjs from 'dayjs';
import { AlertCircle, Check, Clock, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { athleteLoads, loadScale, STATUS_LABELS, type AthleteLoad, type LoadStatus } from '@/lib/teamLoad';
import { formatLoad } from '@/lib/format';
import type { TeamCalendarAthlete } from '@/types';

/** Une seule teinte : prévue en clair, faite en plein. Le statut est porté par une icône et un texte, jamais par la couleur seule. */
const LOAD_COLOR = 'var(--blue)';
const PLANNED_FILL = `color-mix(in srgb, ${LOAD_COLOR} 26%, transparent)`;

const STATUS_ICONS: Record<LoadStatus, { Icon: typeof Check; color: string }> = {
  retard: { Icon: TrendingDown, color: 'var(--orange)' },
  'au-dessus': { Icon: TrendingUp, color: 'var(--orange)' },
  suit: { Icon: Check, color: 'var(--green)' },
  'hors-plan': { Icon: Minus, color: 'var(--label-2)' },
  'a-venir': { Icon: Clock, color: 'var(--label-2)' },
  rien: { Icon: Minus, color: 'var(--label-3)' },
  indisponible: { Icon: AlertCircle, color: 'var(--label-3)' },
};

const pct = (v: number, max: number) => `${Math.min(100, (v / max) * 100)}%`;

/** Résumé lisible d'une ligne (lecteur d'écran et infobulle). */
function describe(r: AthleteLoad): string {
  if (r.status === 'indisponible') return `${r.name} : ${STATUS_LABELS.indisponible}`;
  return `${r.name} : ${STATUS_LABELS[r.status]}. Charge faite ${formatLoad(r.done)}, prévue à ce jour ${formatLoad(r.plannedToDate)}, prévue sur la période ${formatLoad(r.planned)}.`;
}

/**
 * Charge prévue vs faite, une ligne par athlète, sur la période affichée par
 * le planning d'équipe (mêmes données : aucune requête de plus). Rien n'est
 * additionné d'un athlète à l'autre.
 */
export function TeamLoadChart({ athletes, from, to, today = dayjs().format('YYYY-MM-DD') }: { athletes: TeamCalendarAthlete[]; from: string; to: string; today?: string }) {
  const rows = useMemo(() => athleteLoads(athletes, today), [athletes, today]);
  const max = loadScale(rows);
  if (rows.length === 0) return null;

  return (
    <section className="card" aria-labelledby="team-load-title" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <div>
        <h3 id="team-load-title" className="headline" style={{ margin: 0 }}>
          Charge prévue / faite
        </h3>
        <p className="footnote secondary" style={{ margin: '2px 0 0' }}>
          Du {dayjs(from).format('D MMM')} au {dayjs(to).format('D MMM')} · chaque athlète comparé à son propre plan
        </p>
      </div>

      <div className="footnote secondary" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }} aria-hidden>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 8, borderRadius: 4, background: LOAD_COLOR }} />
          Faite
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 8, borderRadius: 4, background: PLANNED_FILL }} />
          Prévue sur la période
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 2, height: 12, borderRadius: 1, background: 'var(--label)' }} />
          Prévue à ce jour
        </span>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {rows.map((r) => {
          const { Icon, color } = STATUS_ICONS[r.status];
          const unavailable = r.status === 'indisponible';
          return (
            <li key={r.id} aria-label={describe(r)} title={describe(r)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7.5em) minmax(0, 1fr) auto', gap: '2px 10px', alignItems: 'center' }}>
              <span style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              <span aria-hidden style={{ position: 'relative', height: 16, display: 'block' }}>
                {!unavailable && (
                  <>
                    <span style={{ position: 'absolute', left: 0, top: 3, height: 10, width: pct(r.planned, max), borderRadius: 4, background: PLANNED_FILL }} />
                    <span style={{ position: 'absolute', left: 0, top: 3, height: 10, width: pct(r.done, max), borderRadius: 4, background: LOAD_COLOR }} />
                    {r.plannedToDate > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 0,
                          height: 16,
                          width: 2,
                          borderRadius: 1,
                          left: `calc(${pct(r.plannedToDate, max)} - 1px)`,
                          background: 'var(--label)',
                          boxShadow: '0 0 0 1px var(--cell)',
                        }}
                      />
                    )}
                  </>
                )}
              </span>
              <span className="footnote tabular-nums" style={{ textAlign: 'right', whiteSpace: 'nowrap' }} aria-hidden>
                {unavailable ? '–' : (
                  <>
                    <b>{formatLoad(r.done)}</b>
                    <span className="secondary"> / {formatLoad(r.plannedToDate)}</span>
                  </>
                )}
              </span>
              <span className="caption secondary" style={{ gridColumn: '2 / 4', display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-hidden>
                <Icon size={13} color={color} strokeWidth={2.6} />
                {STATUS_LABELS[r.status]}
                {!unavailable && r.planned !== r.plannedToDate && ` · ${formatLoad(r.planned)} sur la période`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="caption secondary" style={{ margin: 0 }}>
        Faite / prévue à ce jour. « Suit le plan » : à ±20 % de la charge prévue des jours passés. La forme et la fatigue ne s’additionnent pas d’un athlète à l’autre : chacun se lit sur sa fiche.
      </p>
    </section>
  );
}
