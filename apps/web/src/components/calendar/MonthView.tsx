import { ChevronLeft, ChevronRight, Check, Flag } from 'lucide-react';
import type { AppEvent } from '@/services/calendarApi';
import type { Activity } from '@/types';
import { monthGrid } from '@/lib/calendar';
import { dayMarks, weekPlannedLoad } from '@/lib/monthView';
import { formatLoad } from '@/lib/format';

export interface MonthViewProps {
  month: string; // 'YYYY-MM-01'
  events: AppEvent[];
  activities: Activity[];
  doneEventIds: string[];
  unavailable: (day: string) => 'repos' | 'indisponible' | null;
  today: string; // 'YYYY-MM-DD'
  selected: string | null;
  onSelect: (day: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Mode déplacement/duplication en cours : la grille affiche le bandeau et le toucher choisit la date d'arrivée. */
  picking?: { label: string; onPick: (day: string) => void; onCancel: () => void } | null;
  /** Sous le nom du mois : la prochaine course (« Grand Fond le 8 janvier · dans 6 semaines »). */
  subtitle?: string | null;
  /** Étiquette d'une semaine (lundi AAAA-MM-JJ) par rapport à la course. */
  weekLabel?: (monday: string) => string | null;
}

/**
 * Vue calendrier mois : grille 5-6 semaines (lundi-dimanche) avec
 * barres de séances, statuts (fait, course), charge hebdo.
 */
export function MonthView(props: MonthViewProps) {
  const { month, events, activities, doneEventIds, unavailable, today, selected, onSelect, onPrevMonth, onNextMonth, picking } = props;

  const grid = monthGrid(month);
  const monthName = new Date(`${month}T00:00:00Z`).toLocaleString('fr-FR', { month: 'long', year: 'numeric' }).split(' ')[0];
  const monthUpper = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Couleurs des zones pour la légende
  const legendItems = [
    { label: 'Endurance', color: 'var(--blue)' },
    { label: 'Tempo / SST', color: 'var(--yellow)' },
    { label: 'Seuil', color: 'var(--orange)' },
    { label: 'VO2', color: 'var(--red)' },
    { label: 'Indispo', pattern: true },
  ];

  return (
    <div>
      {/* En-tête : mois + flèches */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 700, letterSpacing: '-0.024em' }}>{monthUpper}</h2>
          {props.subtitle && <div className="footnote secondary">{props.subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          <button
            type="button"
            aria-label="Mois précédent"
            onClick={onPrevMonth}
            style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--blue)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <ChevronLeft size={22} strokeWidth={2.2} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Mois suivant"
            onClick={onNextMonth}
            style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--blue)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <ChevronRight size={22} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </div>

      {/* Bandeau mode picking */}
      {picking && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '8px 12px',
            marginBottom: '8px',
            background: 'var(--fill-2)',
            borderRadius: '8px',
            fontSize: '13px',
          }}
        >
          <span>{picking.label}</span>
          <button
            type="button"
            onClick={picking.onCancel}
            style={{
              padding: '4px 8px',
              background: 'var(--cell)',
              borderRadius: '6px',
              border: '1px solid var(--separator)',
              fontSize: '13px',
              color: 'var(--label)',
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
        </div>
      )}

      {/* Ligne des jours + charge */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) 46px',
          gap: '3px',
          fontSize: '11px',
          color: 'var(--label-2)',
          textAlign: 'center',
          marginBottom: '4px',
        }}
      >
        <span>lu</span>
        <span>ma</span>
        <span>me</span>
        <span>je</span>
        <span>ve</span>
        <span>sa</span>
        <span>di</span>
        <span>charge</span>
      </div>

      {/* Grille du mois */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {grid.map((week, weekIdx) => {
          const weekLoad = weekPlannedLoad(week, events);
          const barWidthPct = Math.min(100, (weekLoad / 600) * 100);

          return (
            <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {props.weekLabel?.(week[0].date) && (
                <div className="caption" style={{ fontWeight: 600, color: week[0].date <= today && today <= week[6].date ? 'var(--tint)' : 'var(--label-2)', padding: '6px 2px 0' }}>
                  {props.weekLabel(week[0].date)}
                </div>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) 46px',
                  gap: '3px',
                }}
              >
                {week.map((day) => {
                  const marks = dayMarks(day.date, events, activities, doneEventIds);
                  const isUnavailable = unavailable(day.date);
                  const isToday = day.date === today;
                  const isSelected = day.date === selected;

                  let cellBackground = 'var(--cell)';
                  if (isUnavailable === 'indisponible' || isUnavailable === 'repos') {
                    cellBackground = 'repeating-linear-gradient(135deg, var(--fill-2) 0 2px, transparent 2px 6px)';
                  }

                  const handleClick = () => {
                    if (picking) {
                      picking.onPick(day.date);
                    } else {
                      onSelect(day.date);
                    }
                  };

                  // Construire aria-label
                  const dayName = new Date(`${day.date}T00:00:00Z`).toLocaleString('fr-FR', {
                    weekday: 'long',
                  });
                  const ariaLabel = `${day.dayOfMonth} ${dayName}${marks.bars.length ? `, ${marks.bars.length} séance${marks.bars.length > 1 ? 's' : ''}` : ''}${marks.done ? ', faite' : ''}`;

                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={handleClick}
                      aria-label={ariaLabel}
                      style={{
                        position: 'relative',
                        height: '62px',
                        borderRadius: '8px',
                        background: cellBackground,
                        padding: '4px 3px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        textAlign: 'left',
                        border: 'none',
                        cursor: 'pointer',
                        opacity: !day.isCurrentMonth ? 0.4 : 1,
                        boxShadow: isSelected ? 'inset 0 0 0 2px var(--blue)' : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums',
                          marginBottom: '2px',
                          marginLeft: '2px',
                          color: isSelected || isToday ? 'var(--blue)' : 'rgba(255, 255, 255, 0.9)',
                        }}
                      >
                        {day.dayOfMonth}
                      </span>
                      {marks.bars.map((bar, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: 'block',
                            width: `${bar.widthPct}%`,
                            height: '5px',
                            borderRadius: '2px',
                            background: bar.color,
                          }}
                        />
                      ))}
                      {marks.done && (
                        <Check
                          size={11}
                          strokeWidth={3.6}
                          style={{
                            position: 'absolute',
                            right: '3px',
                            top: '4px',
                            color: 'var(--green)',
                          }}
                          aria-hidden
                        />
                      )}
                      {marks.race && (
                        <Flag
                          size={12}
                          strokeWidth={2.6}
                          style={{
                            position: 'absolute',
                            right: '3px',
                            top: '4px',
                            color: 'var(--orange)',
                          }}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
                {/* Colonne charge */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'var(--cell)',
                    borderRadius: '8px',
                    padding: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatLoad(weekLoad)}
                  </span>
                  <span
                    style={{
                      width: '32px',
                      height: '4px',
                      borderRadius: '2px',
                      background: 'rgba(118, 118, 128, 0.3)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${barWidthPct}%`,
                        background: 'var(--blue)',
                      }}
                    />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Légende */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px 14px',
          marginTop: '12px',
          fontSize: '12px',
          color: 'var(--label-2)',
        }}
      >
        {legendItems.map((item) =>
          item.pattern ? (
            <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '14px',
                  height: '10px',
                  borderRadius: '2px',
                  background: 'repeating-linear-gradient(135deg, rgba(118, 118, 128, 0.45) 0 2px, transparent 2px 5px)',
                }}
              />
              {item.label}
            </span>
          ) : (
            <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '14px',
                  height: '5px',
                  borderRadius: '2px',
                  background: item.color,
                }}
              />
              {item.label}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
