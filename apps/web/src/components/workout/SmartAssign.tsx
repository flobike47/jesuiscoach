import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Avatar } from '@/components/ios';
import { AthletePicker } from '@/components/workout/AthletePicker';
import { useAssignSuggest } from '@/hooks/useCare';
import { useGroups } from '@/hooks/useTeamPlanning';
import { groupForSending } from '@/lib/assignPlan';
import { variantOf } from '@/lib/quickWorkout';
import { dayShort } from '@/lib/format';
import type { AssignSuggestInput } from '@/services/careApi';
import type { AthleteSummary } from '@/types';

interface SmartAssignProps {
  baseDescription: string;
  sport: 'Ride' | 'Run' | 'Swim';
  athletes: AthleteSummary[];
  selected: Set<string>;
  onSelected: (next: Set<string>) => void;
  /** Lots à envoyer : une description (variante, cibles ajustées) par jour. */
  onSend: (groups: Array<{ date: string; description: string; athleteIds: string[] }>) => Promise<void>;
  isPending: boolean;
}

/**
 * Écran de placement intelligent des séances.
 * Mode « Meilleur jour pour chacun » : suggestions de jour basées sur disponibilités, forme, VFC, sommeil.
 */
export function SmartAssign({
  baseDescription,
  sport,
  athletes,
  selected,
  onSelected,
  onSend,
  isPending,
}: SmartAssignProps) {
  const [showAthletes, setShowAthletes] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    // Start from next Monday
    const today = dayjs();
    const nextMonday = today.startOf('day').add((8 - today.day()) % 7, 'day');
    return nextMonday.format('YYYY-MM-DD');
  });
  const [expandedAthleteId, setExpandedAthleteId] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Map<string, string>>(new Map());

  const groups = useGroups();

  // Calcul de la fenêtre de placement (semaine actuelle + 1)
  const weekEnd = dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD');

  // Récupérer les suggestions si en mode smart et athlètes sélectionnés
  const suggestInput =
    selected.size > 0
      ? ({
          description: baseDescription,
          sport,
          athleteIds: Array.from(selected),
          from: weekStart,
          to: weekEnd,
        } as AssignSuggestInput)
      : null;

  const suggestQuery = useAssignSuggest(suggestInput);

  // Memoize suggestions to avoid changing object on every render
  const suggestions = useMemo(() => suggestQuery.data?.suggestions ?? [], [suggestQuery.data?.suggestions]);

  // Jours choisis à la main (alternative, ou '' = ne pas planifier) appliqués avant de grouper.
  const effective = useMemo(
    () => suggestions.map((sg) => (selectedDates.has(sg.athleteId) ? { ...sg, date: selectedDates.get(sg.athleteId) || null } : sg)),
    [suggestions, selectedDates],
  );
  const groupedSuggestions = useMemo(() => groupForSending(effective, baseDescription, variantOf), [effective, baseDescription]);

  // Nombre de séances (une par athlète planifié), pas de lots.
  const planningCount = groupedSuggestions.reduce((n, g) => n + g.athleteIds.length, 0);

  // Résolvette pour l'UI du jour
  const getDayDisplay = (date: string | null) => {
    if (!date) return '—';
    const d = dayjs(date);
    const num = d.format('D');
    return `${dayShort(date)} ${num}`;
  };

  // Variante display
  const getVariantLabel = (variant: string, intensityScale: number): string => {
    if (variant === 'courte' && intensityScale < 1) {
      const percent = Math.round((1 - intensityScale) * 100);
      return `Courte −${percent} %`;
    }
    if (variant === 'courte') return 'Courte';
    if (variant === 'longue') return 'Longue';
    return 'Standard';
  };

  // Raison avec couleur (orange si surcharge, etc.)
  const getReasonStyle = (reason: string) => {
    const isWarning =
      reason.toLowerCase().includes('surcharge') ||
      reason.toLowerCase().includes('reprise') ||
      reason.toLowerCase().includes('remplace') ||
      reason.toLowerCase().includes('semaine');
    return isWarning ? { color: 'var(--orange)' } : {};
  };

  // Affichage du mode « Meilleur jour pour chacun »
  return (
    <div>

      {/* Sélection d'athlètes avec groupes et lien « Choisir… » */}
      <h3 className="section-header">
        Pour qui
        <button
          type="button"
          style={{ float: 'right', color: 'var(--tint)', textTransform: 'none', fontSize: '15px' }}
          onClick={() => setShowAthletes(!showAthletes)}
        >
          Choisir…
        </button>
      </h3>
      <div className="chips" style={{ marginTop: 0, marginBottom: showAthletes ? 12 : 0 }}>
        <button
          type="button"
          onClick={() => onSelected(new Set(athletes.map((a) => a.id)))}
          aria-pressed={selected.size === athletes.length && athletes.length > 0}
          className={selected.size === athletes.length && athletes.length > 0 ? 'chip active' : 'chip'}
        >
          Tous · {athletes.length}
        </button>
        {groups.data?.groups.map((group) => {
          const count = group.athleteIds.filter((id) => athletes.some((a) => a.id === id)).length;
          const allInGroup = group.athleteIds.length === selected.size && group.athleteIds.every((id) => selected.has(id));
          return (
            <button
              key={group.id}
              type="button"
              className={allInGroup ? 'chip active' : 'chip'}
              aria-pressed={allInGroup}
              onClick={() => onSelected(new Set(group.athleteIds))}
            >
              {group.name} · {count}
            </button>
          );
        })}
      </div>

      {showAthletes && <AthletePicker athletes={athletes} selected={selected} onChange={onSelected} />}

      {/* Fenêtre de placement (semaine) */}
      <h3 className="section-header">Quand</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setWeekStart(dayjs(weekStart).subtract(7, 'day').format('YYYY-MM-DD'))}
          style={{ minHeight: 44, padding: '0 8px', color: 'var(--tint)' }}
        >
          ‹
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '15px', fontWeight: 600 }}>
          Semaine du {dayjs(weekStart).format('DD MMM')}
        </span>
        <button
          type="button"
          onClick={() => setWeekStart(dayjs(weekStart).add(7, 'day').format('YYYY-MM-DD'))}
          style={{ minHeight: 44, padding: '0 8px', color: 'var(--tint)' }}
        >
          ›
        </button>
      </div>

      {/* Encart explicatif */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '14px 4px 10px' }}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--purple)"
          strokeWidth="2"
          aria-hidden
          style={{ flex: 'none', marginTop: 2 }}
        >
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        </svg>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--label-2)', lineHeight: 1.4 }}>
          Placé selon les disponibilités, la forme, la VFC et le sommeil remontés par Intervals.icu, et les séances déjà
          prévues.
        </p>
      </div>

      {/* Suggestions */}
      {suggestQuery.isLoading ? (
        <div style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--label-2)' }}>
          Calcul des placements…
        </div>
      ) : suggestions.length === 0 ? (
        <div style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--label-2)' }}>
          Aucune suggestion disponible.
        </div>
      ) : (
        <div className="group">
          {suggestions.map((suggestion) => {
            const isExpanded = expandedAthleteId === suggestion.athleteId;
            const isBlocked = suggestion.blocked !== null;
            const chosenDate = selectedDates.get(suggestion.athleteId) ?? suggestion.date;

            return (
              <div key={suggestion.athleteId}>
                <button
                  type="button"
                  className="cell"
                  aria-expanded={isExpanded}
                  onClick={() => !isBlocked && setExpandedAthleteId(isExpanded ? null : suggestion.athleteId)}
                  style={{ ['--separator-inset' as string]: '64px', alignItems: 'flex-start', opacity: isBlocked ? 0.55 : 1 }}
                >
                  <Avatar name={suggestion.name} />
                  <div className="cell-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cell-title">{suggestion.name}</span>
                      <span className="token" style={{ ['--token' as string]: suggestion.variant === 'standard' ? 'var(--gray)' : suggestion.variant === 'courte' ? 'var(--orange)' : 'var(--green)' }}>
                        {getVariantLabel(suggestion.variant, suggestion.intensityScale)}
                      </span>
                    </div>
                    <div className="cell-subtitle" style={getReasonStyle(suggestion.reasons[0] ?? '')}>
                      {isBlocked ? suggestion.blocked : suggestion.reasons[0]}
                    </div>
                  </div>
                  <span className="token" style={{ ['--token' as string]: isBlocked || !chosenDate ? 'var(--gray)' : 'var(--blue)', alignSelf: 'center', minHeight: 30 }}>
                    {chosenDate ? getDayDisplay(chosenDate) : 'Non planifiée'}
                  </span>
                </button>

                {/* Alternatives */}
                {isExpanded && !isBlocked && (
                  <div className="chips" style={{ margin: 0, padding: '0 16px 12px 64px', flexWrap: 'wrap' }} role="group" aria-label={`Autres jours pour ${suggestion.name}`}>
                    {[suggestion.date, ...suggestion.alternatives].filter((d): d is string => Boolean(d)).map((alt) => (
                      <button key={alt} type="button" className={chosenDate === alt ? 'chip active' : 'chip'} aria-pressed={chosenDate === alt} onClick={() => setSelectedDates(new Map(selectedDates).set(suggestion.athleteId, alt))}>
                        {getDayDisplay(alt)}
                      </button>
                    ))}
                    <button type="button" className={chosenDate === '' ? 'chip active' : 'chip'} aria-pressed={chosenDate === ''} onClick={() => setSelectedDates(new Map(selectedDates).set(suggestion.athleteId, ''))}>
                      Ne pas planifier
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compteur et boutons */}
      <div style={{ padding: '12px 16px 34px', borderTop: '.5px solid var(--separator)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--label-2)' }}>
          <span>Chaque athlète reçoit sa variante ; les cibles sont baissées de 5 % en cas de surcharge.</span>
        </div>

        <button
          type="button"
          style={{
            minHeight: 50,
            borderRadius: 14,
            background: 'var(--tint)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 15,
            border: 0,
            cursor: 'pointer',
            opacity: isPending || planningCount === 0 ? 0.5 : 1,
          }}
          disabled={isPending || planningCount === 0}
          onClick={() => onSend(groupedSuggestions.map((g) => ({ date: g.date, description: g.description, athleteIds: g.athleteIds })))}
        >
          {isPending
            ? 'Planification…'
            : planningCount === 0
              ? 'Aucune séance à planifier'
              : `Planifier ${planningCount} séance${planningCount > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
