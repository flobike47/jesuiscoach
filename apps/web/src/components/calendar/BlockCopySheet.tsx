import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Sheet } from '@/components/ios';
import { NumberStepper } from '@/components/common/NumberStepper';
import { AthletePicker } from '@/components/workout/AthletePicker';
import { useCalendar } from '@/hooks/useCoach';
import { useApplyWorkouts } from '@/hooks/useBatchSend';
import { BLOCK_MAX_WEEKS, blockEnd, blockWorkouts, overlapsSource } from '@/lib/blockCopy';
import { addDays, mondayOf, sendProblem, sendReport } from '@/lib/batchSend';
import type { AthleteSummary } from '@/types';

const fmt = (day: string) => dayjs(day).format('D MMM');
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Duplique un bloc de semaines consécutives d'un athlète (à partir de la
 * semaine affichée) vers une autre période et / ou d'autres athlètes. Envoi
 * en une fois par le BFF, avec les bornes et le quota des plans.
 */
export function BlockCopySheet({
  athleteId,
  monday,
  athletes,
  onClose,
}: {
  athleteId: string;
  /** Lundi de la première semaine du bloc (AAAA-MM-JJ). */
  monday: string;
  athletes: AthleteSummary[];
  onClose: () => void;
}) {
  const [weeks, setWeeks] = useState(2);
  // Arrivée : juste après le bloc tant que le coach n'a pas choisi d'autre date.
  const [target, setTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set([athleteId]));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const apply = useApplyWorkouts();

  // Une seule lecture couvre tous les choix de durée (8 semaines = 56 jours, sous la limite de 62 du BFF).
  const source = useCalendar(athleteId, monday, blockEnd(monday, BLOCK_MAX_WEEKS));
  const block = useMemo(() => blockWorkouts(source.data?.events ?? [], monday, weeks), [source.data, monday, weeks]);

  const start = target ? mondayOf(target) : addDays(monday, weeks * 7);
  const sourceName = athletes.find((a) => a.id === athleteId)?.name ?? 'cet athlète';
  const nameOf = (id: string) => athletes.find((a) => a.id === id)?.name ?? id;
  const count = block.workouts.length;
  const writes = count * selected.size;
  const overlap = selected.has(athleteId) && overlapsSource(monday, start, weeks);
  const problem = source.isLoading
    ? 'Lecture du calendrier…'
    : source.error
      ? source.error.message
      : overlap
        ? `Le bloc d’arrivée recouvre le bloc copié : les séances de ${sourceName} seraient en double. Choisis un lundi à partir du ${fmt(addDays(monday, weeks * 7))}.`
        : sendProblem(count, selected.size);

  const run = async () => {
    setMessage(null);
    try {
      const { total, results } = await apply.mutateAsync({ workouts: block.workouts, athleteIds: [...selected], startDate: start });
      const report = sendReport(total, results, nameOf);
      setMessage(report);
      if (report.ok) onClose();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <Sheet open onClose={onClose} title="Dupliquer un bloc">
      <h3 className="section-header">Bloc copié</h3>
      <div className="group" style={{ padding: '8px 16px' }}>
        <NumberStepper label="Semaines" value={weeks} onChange={setWeeks} min={1} max={BLOCK_MAX_WEEKS} step={1} />
      </div>
      <p className="section-footer tabular-nums">
        {sourceName} · du lundi {fmt(monday)} au dimanche {fmt(blockEnd(monday, weeks))} : {plural(count, 'séance')}
        {block.skipped > 0 && ` (${plural(block.skipped, 'séance')} sans structure non recopiée${block.skipped > 1 ? 's' : ''})`}. Compétitions et notes ne sont pas recopiées.
      </p>

      <h3 className="section-header">Arrivée</h3>
      <div className="group">
        <input
          type="date"
          className="field"
          aria-label="Semaine d’arrivée"
          value={start}
          onChange={(e) => e.target.value && setTarget(e.target.value)}
        />
      </div>
      <p className="section-footer">
        Semaine du lundi {fmt(start)} au dimanche {fmt(blockEnd(start, weeks))}. Chaque séance garde son jour de la semaine.
      </p>

      <AthletePicker athletes={athletes} selected={selected} onChange={setSelected} />

      <p role="status" className="footnote tabular-nums" style={{ margin: '14px 4px 0' }}>
        {plural(count, 'séance')} × {plural(selected.size, 'athlète')} = <b>{plural(writes, 'séance')} à créer</b>, chacune envoyée à Intervals.icu
        {count > 0 && ` (${count} par athlète, sur son quota de 100 requêtes par jour)`}.
      </p>
      {problem && !source.isLoading && (
        <p role="alert" className="footnote" style={{ color: 'var(--orange)', margin: '8px 4px 0' }}>
          {problem}
        </p>
      )}
      <button type="button" className="button filled block pressable" style={{ marginTop: 14 }} disabled={apply.isPending || problem != null} onClick={run}>
        {apply.isPending ? 'Envoi…' : `Créer ${plural(writes, 'séance')}`}
      </button>
      <p className="section-footer">Les séances créées sont indépendantes : chacune se déplace ou se supprime seule. Au plus 40 séances et 120 envois à la fois.</p>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className="footnote" style={{ color: message.ok ? 'var(--green)' : 'var(--red)', margin: '10px 4px 0' }}>
          {message.text}
        </p>
      )}
    </Sheet>
  );
}
