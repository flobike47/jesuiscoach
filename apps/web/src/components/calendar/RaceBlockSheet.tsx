import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Flag } from 'lucide-react';
import { Sheet, Segmented } from '@/components/ios';
import { NumberStepper } from '@/components/common/NumberStepper';
import { buildBlock, type BlockInput, type Phase } from '@/lib/periodize';
import { useCare } from '@/hooks/useCare';
import { useEventMutations } from '@/hooks/useCalendarData';
import { useSavePlan } from '@/hooks/useCoach';
import { formatDuration, formatLoad, dayShort, signed } from '@/lib/format';
import { formZone } from '@/lib/form';
import type { Race } from '@/services/calendarApi';
import type { Sport } from '@/types';

const PHASE_COLORS: Record<Phase, string> = {
  developpement: 'var(--green)',
  allegee: 'var(--teal)',
  specifique: 'var(--yellow)',
  affutage: 'var(--orange)',
  course: 'var(--red)',
};

const PHASE_LABELS: Record<Phase, string> = {
  developpement: 'DÉV.',
  allegee: 'ALLÉG.',
  specifique: 'SPÉ.',
  affutage: 'AFF.',
  course: 'COURSE',
};

/** Feuille de construction d'un bloc jusqu'à une course. */
export function RaceBlockSheet({
  athleteId,
  race,
  sport,
  today,
  onClose,
}: {
  athleteId: string;
  race: Race;
  sport: Sport;
  today: string;
  onClose: () => void;
}) {
  const careQuery = useCare(athleteId);
  // Sans fiche de disponibilités lisible : tous les jours, sans durée maximale.
  const care = useMemo(
    () => careQuery.data ?? (careQuery.isError ? { days: [] as Array<{ weekday: number; available: boolean; maxMinutes: number | null }> } : undefined),
    [careQuery.data, careQuery.isError],
  );
  const { create } = useEventMutations();
  const { mutateAsync: savePlan } = useSavePlan();

  // État des réglages
  const [volumeFrom, setVolumeFrom] = useState(7);
  const [volumeTo, setVolumeTo] = useState(10);
  const [cycle, setCycle] = useState<string>('3');
  const [keySessions, setKeySessions] = useState<Array<'sweet spot' | 'seuil' | 'vo2' | 'longue'>>(['sweet spot', 'seuil', 'longue']);
  const [sendTwoWeeksOnly, setSendTwoWeeksOnly] = useState(true);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  // Calculer les jours disponibles et durées max
  const availableWeekdays = useMemo(() => {
    if (!care || care.days.length === 0) return [0, 1, 2, 3, 4, 5, 6];
    return care.days.filter((d) => d.available).map((d) => d.weekday);
  }, [care]);

  const maxMinutesByWeekday = useMemo(() => {
    if (!care) return {};
    const result: Record<number, number> = {};
    for (const d of care.days) {
      if (d.maxMinutes != null) result[d.weekday] = d.maxMinutes;
    }
    return result;
  }, [care]);

  // Recalculer le bloc à chaque changement de réglage
  const block = useMemo(() => {
    if (!care) return null;
    const cycleNum = (cycle === '2' ? 2 : 3) as 2 | 3;
    const input: BlockInput = {
      today,
      raceDate: race.date,
      raceName: race.name,
      sport,
      weeklyHours: { from: volumeFrom, to: volumeTo },
      availableWeekdays,
      maxMinutesByWeekday,
      keySessions,
      cycle: cycleNum,
    };
    return buildBlock(input);
  }, [today, race, sport, volumeFrom, volumeTo, availableWeekdays, maxMinutesByWeekday, keySessions, cycle, care]);

  // Nombre de semaines à envoyer
  const weeksToSend = sendTwoWeeksOnly ? Math.min(2, block?.weeks.length ?? 0) : block?.weeks.length ?? 0;

  // Validation : au moins une séance clé
  const canToggleSession = (session: typeof keySessions[number]) => keySessions.length > 1 || keySessions[0] !== session;

  const toggleSession = (session: typeof keySessions[number]) => {
    if (!canToggleSession(session)) return;
    setKeySessions(keySessions.includes(session) ? keySessions.filter((s) => s !== session) : [...keySessions, session]);
  };

  // Envoyer le bloc
  const submit = async () => {
    if (!block || !care) return;
    setError(null);
    setCreating(true);

    const sent = block.weeks.slice(0, weeksToSend).flatMap((w) => w.workouts.filter((wo) => wo.description));
    const kept = sendTwoWeeksOnly ? block.weeks.slice(weeksToSend) : [];
    const failed: string[] = [];
    for (const [i, wo] of sent.entries()) {
      setProgress(`${i + 1} / ${sent.length}`);
      try {
        await create.mutateAsync({ athleteId, body: { kind: 'workout', date: wo.date, name: wo.name, description: wo.description, sport } });
      } catch (e) {
        failed.push(`${dayjs(wo.date).format('D MMM')} · ${wo.name} : ${(e as Error).message}`);
      }
    }
    setProgress(null);
    try {
      if (kept.length > 0) {
        // Plan « suite » : jour 0 = lundi de la première semaine non envoyée.
        const base = dayjs(kept[0].start);
        const workouts = kept.flatMap((w) => w.workouts.filter((wo) => wo.description)).map((wo) => ({ day: dayjs(wo.date).diff(base, 'day'), name: wo.name, description: wo.description, sport }));
        await savePlan({ name: `${race.name} — suite`, workouts });
      }
    } catch (e) {
      failed.push(`Plan « ${race.name} — suite » non enregistré : ${(e as Error).message}`);
    }
    setCreating(false);
    if (failed.length) return setError(`${sent.length - failed.length} séance(s) envoyée(s). Non créées : ${failed.join(' · ')}`);
    onClose();
  };

  if (!block || !care) {
    return <Sheet open onClose={onClose} title="Préparer une course"><p className="footnote secondary" style={{ padding: 16 }}>Lecture des disponibilités…</p></Sheet>;
  }

  const raceForm = block.estimatedRaceForm;
  const formDetails = formZone(raceForm);
  const maxLoadInBlock = Math.max(...block.weeks.map((w) => w.load), 1);

  const raceDate = dayjs(race.date);
  const daysUntilRace = raceDate.diff(dayjs(today), 'day');
  const weeksUntilRace = Math.ceil((daysUntilRace + 1) / 7);

  return (
    <Sheet open onClose={onClose} title="Préparer une course">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, padding: '12px 16px 0' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'color-mix(in srgb, var(--orange) 18%, transparent)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Flag size={22} color="var(--orange)" aria-hidden />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{race.name} · priorité {race.racePriority}</div>
            <div className="caption secondary">
              {raceDate.format('dddd D MMMM')} · {weeksUntilRace} sem.
            </div>
          </div>
        </div>

        <h3 className="section-header" style={{ margin: '16px 16px 8px' }}>
          Réglages du bloc
        </h3>
        <div className="group" style={{ display: 'grid', gap: 2, margin: '0 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 12px' }}>
            <NumberStepper label="De" value={volumeFrom} onChange={setVolumeFrom} min={3} max={25} step={1} unit="h" />
            <NumberStepper label="À" value={volumeTo} onChange={setVolumeTo} min={3} max={25} step={1} unit="h" />
          </div>

          <div style={{ padding: '8px 12px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15 }}>
              <span>Jours</span>
              <span className="caption secondary">
                depuis son profil · {availableWeekdays.length} j
              </span>
            </label>
          </div>

          <div style={{ padding: '8px 12px' }}>
            <span style={{ display: 'block', fontSize: 15, marginBottom: 8 }}>Séances clés</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {(['sweet spot', 'seuil', 'vo2', 'longue'] as const).map((s) => {
                const labels: Record<typeof s, string> = { 'sweet spot': 'Sweet spot', seuil: 'Seuil', vo2: 'VO2', longue: 'Sortie longue' };
                const isChecked = keySessions.includes(s);
                return (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canToggleSession(s) ? 'pointer' : 'not-allowed', opacity: canToggleSession(s) ? 1 : 0.5 }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSession(s)}
                      disabled={!canToggleSession(s)}
                      style={{ width: 18, height: 18, cursor: canToggleSession(s) ? 'pointer' : 'not-allowed' }}
                    />
                    <span style={{ fontSize: 14 }}>{labels[s]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ padding: '8px 12px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15 }}>
              <span>Rythme</span>
              <div style={{ width: 100 }}>
                <Segmented
                  value={cycle}
                  onChange={setCycle}
                  label="Rythme du bloc"
                  options={[
                    { value: '3', label: '3+1' },
                    { value: '2', label: '2+1' },
                  ]}
                />
              </div>
            </label>
          </div>
        </div>

        <h3 className="section-header" style={{ margin: '16px 16px 8px' }}>
          Proposition · {block.totalWorkouts} séances
        </h3>
        <div className="group" style={{ overflow: 'hidden', margin: '0 16px' }}>
          {block.weeks.map((week, idx) => {
            const isExpanded = expandedWeek === idx;
            const maxLoadPercent = (week.load / maxLoadInBlock) * 100;
            const weekDate = dayjs(week.start);
            return (
              <div key={idx}>
                <button
                  type="button"
                  onClick={() => setExpandedWeek(isExpanded ? null : idx)}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '58px minmax(0, 1fr) 40px',
                    gap: 10,
                    alignItems: 'center',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 5,
                      padding: '2px 5px',
                      textAlign: 'center',
                      background: `color-mix(in srgb, ${PHASE_COLORS[week.phase]} 18%, transparent)`,
                      color: PHASE_COLORS[week.phase],
                      textTransform: 'uppercase',
                    }}
                  >
                    {PHASE_LABELS[week.phase]}
                  </div>
                  <div>
                    <div style={{ fontSize: 15 }}>{weekDate.format('D MMM')} · {week.summary}</div>
                    <div
                      style={{
                        marginTop: 5,
                        height: 6,
                        width: `${maxLoadPercent}%`,
                        borderRadius: 3,
                        background: PHASE_COLORS[week.phase],
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(week.load)}</div>
                  {idx > 0 && <div style={{ position: 'absolute', top: 0, left: 12, right: 0, height: 0.5, background: 'var(--separator)' }} />}
                </button>
                {isExpanded && (
                  <div style={{ padding: '0 12px 8px', background: 'var(--fill)' }}>
                    {week.workouts.map((wo) => (
                      <div key={wo.date} style={{ padding: '8px 0', fontSize: 14, lineHeight: 1.4 }}>
                        <div style={{ fontWeight: 600 }}>
                          {dayShort(wo.date).toUpperCase()} {dayjs(wo.date).format('D')} · {wo.name}
                        </div>
                        {wo.description && (
                          <div className="caption secondary" style={{ marginTop: 2 }}>
                            {formatDuration(wo.seconds)} · {formatLoad(wo.load)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="caption secondary" style={{ margin: '12px 16px 0' }}>
          Forme estimée le jour J :{' '}
          <span style={{ fontWeight: 600, color: formDetails.color }}>
            {signed(raceForm)}, {formDetails.label.toLowerCase()}
          </span>
        </p>

        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 12, margin: '12px 16px 0', background: 'var(--fill)', borderRadius: 10 }}>
            <AlertTriangle size={18} color="var(--red)" style={{ flex: 'none', marginTop: 2 }} aria-hidden />
            <div style={{ fontSize: 14, color: 'var(--red)' }}>{error}</div>
          </div>
        )}

        <div style={{ padding: '12px 16px 34px', borderTop: '0.5px solid var(--separator)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, fontSize: 15 }}>
            <span>
              Envoyer seulement les 2 premières semaines
              <div className="caption secondary" style={{ marginTop: 2 }}>
                Le reste est gardé en plan dans Séances, à appliquer quand tu veux : il s’ajustera mieux à ses sorties réelles.
              </div>
            </span>
            <input
              type="checkbox"
              checked={sendTwoWeeksOnly}
              onChange={(e) => setSendTwoWeeksOnly(e.target.checked)}
              style={{ width: 18, height: 18, flex: 'none', marginTop: 2 }}
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={creating}
            style={{
              minHeight: 50,
              borderRadius: 14,
              background: 'var(--tint)',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              cursor: creating ? 'not-allowed' : 'pointer',
              opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? `Envoi ${progress ?? '…'}` : sendTwoWeeksOnly ? 'Envoyer les 2 premières semaines' : 'Envoyer tout le bloc'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
