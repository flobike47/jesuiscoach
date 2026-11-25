import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { NumberStepper } from '@/components/common/NumberStepper';
import { Cell, Sheet } from '@/components/ios';
import { useApplyPlan, useDeletePlan, useLibrary, useSavedWorkouts, useSavePlan, useTeam } from '@/hooks/useCoach';
import { formatDuration } from '@/lib/format';
import { parseWorkout, SPORT_LABELS, STARTERS, TEMPLATES, workoutStats, type Sport } from '@/lib/workout';
import { formatMeters } from '@/lib/workoutBlocks';
import type { PlanWorkout, TrainingPlan } from '@/types';
import { AthletePicker } from './AthletePicker';
import { StructureEditor, WorkoutProfile } from './StructureEditor';

/** Bornes alignées sur le BFF (lib/plans.ts). */
const MAX_WORKOUTS = 40;
const MAX_DAY = 83;
const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

interface Item extends PlanWorkout {
  key: string;
}

let seq = 0;
const keyed = (w: PlanWorkout): Item => ({ ...w, key: `w${++seq}` });

/** « Semaine 2 · jour 3 », ou la date réelle si le jour de départ est connu. */
function dayLabel(day: number, start: string | null): string {
  if (start) return dayjs(start).add(day, 'day').format('ddd D MMM');
  return `Semaine ${Math.floor(day / 7) + 1} · jour ${(day % 7) + 1}`;
}

/** Plan sur plusieurs semaines : séances placées par jour, puis appliquées au calendrier. */
export function PlanSheet({ plan, onClose }: { plan: TrainingPlan | null; onClose: () => void }) {
  const save = useSavePlan();
  const remove = useDeletePlan();
  const [id, setId] = useState(plan?.id ?? null);
  const [name, setName] = useState(plan?.name ?? 'Nouveau plan');
  const [items, setItems] = useState<Item[]>(() => (plan?.workouts ?? []).map(keyed));
  const [dirty, setDirty] = useState(!plan);
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => [...items].sort((a, b) => a.day - b.day), [items]);
  const totals = useMemo(() => {
    let seconds = 0;
    let load = 0;
    for (const w of items) {
      const s = workoutStats(parseWorkout(w.description));
      seconds += s.seconds;
      load += s.load;
    }
    const weeks = items.length ? Math.floor(Math.max(...items.map((w) => w.day)) / 7) + 1 : 0;
    return { seconds, load, weeks };
  }, [items]);

  const change = (next: Item[]) => {
    setItems(next);
    setDirty(true);
  };
  const update = (key: string, patch: Partial<PlanWorkout>) => change(items.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  const add = (w: Source) => {
    const last = items.length ? Math.max(...items.map((x) => x.day)) : -2;
    const item = keyed({ day: Math.min(MAX_DAY, last + 2), name: w.name, description: w.description, sport: w.sport ?? 'Ride' });
    change([...items, item]);
    setPicking(false);
    setOpen(item.key);
  };

  const onSave = async () => {
    setError(null);
    if (!name.trim()) return setError('Donne un nom au plan.');
    if (items.length === 0) return setError('Ajoute au moins une séance.');
    try {
      const saved = await save.mutateAsync({ id: id ?? undefined, name: name.trim(), workouts: sorted.map(({ day, name: n, description, sport }) => ({ day, name: n, description, sport: sport ?? 'Ride' })) });
      setId(saved.id);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!id) return onClose();
    if (!window.confirm(`Supprimer le plan « ${name} » ? Les séances déjà envoyées restent dans les calendriers.`)) return;
    await remove.mutateAsync(id);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Plan"
      action={
        <button type="button" onClick={onSave} disabled={save.isPending || !dirty} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44, opacity: dirty ? 1 : 0.4 }}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="group">
        <input className="field" aria-label="Nom du plan" value={name} maxLength={120} onChange={(e) => (setName(e.target.value), setDirty(true))} style={{ fontWeight: 600 }} />
      </div>
      <p className="section-footer tabular-nums">
        {items.length} séance{items.length > 1 ? 's' : ''} · {totals.weeks} semaine{totals.weeks > 1 ? 's' : ''} · {formatDuration(totals.seconds)} · charge {totals.load}
      </p>

      <h3 className="section-header">Séances</h3>
      <div className="group">
        {sorted.length === 0 && (
          <div className="footnote secondary" style={{ padding: '14px 16px' }}>
            Ajoute des séances depuis la bibliothèque, puis place-les dans les semaines.
          </div>
        )}
        {sorted.map((w, i) => (
          <PlanItem
            key={w.key}
            item={w}
            first={i === 0}
            open={open === w.key}
            onToggle={() => setOpen(open === w.key ? null : w.key)}
            onChange={(patch) => update(w.key, patch)}
            onDelete={() => change(items.filter((x) => x.key !== w.key))}
          />
        ))}
      </div>
      {picking ? (
        <SourcePicker onPick={add} onCancel={() => setPicking(false)} />
      ) : (
        <button
          type="button"
          className="button tinted block pressable"
          style={{ marginTop: 10, minHeight: 44 }}
          disabled={items.length >= MAX_WORKOUTS}
          onClick={() => setPicking(true)}
        >
          <Plus size={18} aria-hidden />
          {items.length >= MAX_WORKOUTS ? `${MAX_WORKOUTS} séances au plus` : 'Ajouter une séance'}
        </button>
      )}

      {error && (
        <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: '12px 4px 0' }}>
          {error}
        </p>
      )}

      {id && <ApplySection planId={id} dirty={dirty} items={sorted} />}

      {(id || items.length > 0) && (
        <button type="button" className="pressable" onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', minHeight: 44, margin: '20px auto 0' }}>
          <Trash2 size={16} aria-hidden />
          {id ? 'Supprimer le plan' : 'Abandonner'}
        </button>
      )}
    </Sheet>
  );
}

function PlanItem({
  item,
  first,
  open,
  onToggle,
  onChange,
  onDelete,
}: {
  item: Item;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PlanWorkout>) => void;
  onDelete: () => void;
}) {
  const steps = useMemo(() => parseWorkout(item.description), [item.description]);
  const stats = workoutStats(steps);
  const sport: Sport = item.sport ?? 'Ride';
  const size = stats.complete ? `${formatDuration(stats.seconds)} · charge ${stats.load}` : formatMeters(stats.meters);
  return (
    <div style={{ borderTop: first ? 'none' : '0.5px solid var(--separator)' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '8px 16px', textAlign: 'left' }}>
        <span style={{ width: 54, flexShrink: 0 }}>
          <WorkoutProfile steps={steps} sport={sport} height={28} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          <span className="footnote secondary tabular-nums">
            {dayLabel(item.day, null)} · {SPORT_LABELS[sport]} · {size}
          </span>
        </span>
        <ChevronDown size={18} color="var(--label-3)" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease-out' }} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px', display: 'grid', gap: 12 }}>
          <input
            className="field"
            aria-label="Nom de la séance"
            value={item.name}
            maxLength={120}
            onChange={(e) => onChange({ name: e.target.value })}
            style={{ background: 'var(--fill)', borderRadius: 10, minHeight: 40, fontWeight: 600 }}
          />
          <NumberStepper
            label="Jour du plan"
            value={item.day + 1}
            min={1}
            max={MAX_DAY + 1}
            step={1}
            format={(v) => dayLabel(v - 1, null)}
            onChange={(v) => onChange({ day: v - 1 })}
          />
          <StructureEditor description={item.description} sport={sport} onChange={(description) => onChange({ description })} />
          <button type="button" className="pressable" onClick={onDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--red)', minHeight: 36, justifySelf: 'start' }}>
            <Trash2 size={16} aria-hidden />
            Retirer du plan
          </button>
        </div>
      )}
    </div>
  );
}

interface Source {
  name: string;
  description: string;
  sport?: Sport;
}

/** Choix d'une séance à ajouter : mes séances, séances types et bibliothèque Intervals.icu. */
function SourcePicker({ onPick, onCancel }: { onPick: (w: Source) => void; onCancel: () => void }) {
  const library = useLibrary();
  const saved = useSavedWorkouts();
  const mine = saved.data?.workouts ?? [];
  return (
    <div style={{ marginTop: 10 }}>
      <h3 className="section-header">
        Ajouter{' '}
        <button type="button" style={{ float: 'right', color: 'var(--tint)', textTransform: 'none' }} onClick={onCancel}>
          Annuler
        </button>
      </h3>
      <div className="group">
        {(['Ride', 'Run', 'Swim'] as const).map((sport) => (
          <Cell
            key={sport}
            title={<span style={{ color: 'var(--tint)' }}>Séance vide · {SPORT_LABELS[sport].toLowerCase()}</span>}
            onClick={() => onPick({ name: 'Nouvelle séance', description: STARTERS[sport], sport })}
          />
        ))}
      </div>
      {mine.length > 0 && (
        <>
          <h3 className="section-header">Mes séances</h3>
          <div className="group">
            {mine.map((w) => (
              <Cell key={w.id} title={w.name} detail={SPORT_LABELS[w.sport]} onClick={() => onPick(w)} />
            ))}
          </div>
        </>
      )}
      {(['Ride', 'Run', 'Swim'] as const).map((sport) => (
        <div key={sport}>
          <h3 className="section-header">Séances types · {SPORT_LABELS[sport].toLowerCase()}</h3>
          <div className="group">
            {TEMPLATES.filter((t) => t.sport === sport).map((t) => (
              <Cell key={t.name} title={t.name} onClick={() => onPick(t)} />
            ))}
          </div>
        </div>
      ))}
      {(library.data?.folders ?? []).map((f) => (
        <div key={f.id}>
          <h3 className="section-header">{f.name}</h3>
          <div className="group">
            {f.workouts.map((w) => (
              <Cell key={w.id} title={w.name} detail={SPORT_LABELS[w.sport]} onClick={() => onPick(w)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplySection({ planId, dirty, items }: { planId: string; dirty: boolean; items: Item[] }) {
  const team = useTeam();
  const apply = useApplyPlan();
  const [start, setStart] = useState(() => {
    // Lundi prochain par défaut : un plan démarre en général en début de semaine.
    const d = dayjs();
    return d.add(((8 - d.day()) % 7) || 7, 'day').format('YYYY-MM-DD');
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const athletes = team.data?.athletes ?? [];
  const writes = items.length * selected.size;
  const startDay = dayjs(start).isValid() ? WEEKDAYS[(dayjs(start).day() + 6) % 7] : '';

  const run = async () => {
    setMessage(null);
    if (selected.size === 0) return setMessage({ ok: false, text: 'Choisis au moins un athlète.' });
    try {
      const { total, results } = await apply.mutateAsync({ id: planId, athleteIds: [...selected], startDate: start });
      const failed = results.filter((r) => !r.ok);
      setMessage(
        failed.length
          ? { ok: false, text: `${failed.length} athlète(s) en échec (${failed[0].error ?? 'erreur inconnue'}) ; ${failed[0].created}/${total} séances envoyées pour le premier.` }
          : { ok: true, text: `${total} séance${total > 1 ? 's' : ''} envoyée${total > 1 ? 's' : ''} à ${results.length} athlète${results.length > 1 ? 's' : ''}.` },
      );
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <>
      <h3 className="section-header">Appliquer le plan</h3>
      <div className="group">
        <input type="date" className="field" aria-label="Jour de départ" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <p className="section-footer">
        Jour de départ{startDay ? ` (${startDay})` : ''} : première séance le {items.length ? dayLabel(items[0].day, start) : '–'}, dernière le{' '}
        {items.length ? dayLabel(items[items.length - 1].day, start) : '–'}.
      </p>
      <AthletePicker athletes={athletes} selected={selected} onChange={setSelected} />
      <button
        type="button"
        className="button filled block pressable"
        style={{ marginTop: 14 }}
        disabled={apply.isPending || dirty || items.length === 0}
        onClick={run}
      >
        {apply.isPending ? 'Envoi…' : dirty ? 'Enregistre le plan d’abord' : `Envoyer ${writes || items.length} séance${(writes || items.length) > 1 ? 's' : ''}`}
      </button>
      <p className="section-footer">Chaque séance arrive dans le calendrier Intervals.icu de l’athlète, puis sur sa montre. Au plus 120 séances par envoi.</p>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className="footnote" style={{ color: message.ok ? 'var(--green)' : 'var(--red)', margin: '10px 4px 0' }}>
          {message.text}
        </p>
      )}
    </>
  );
}
