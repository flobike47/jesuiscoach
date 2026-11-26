import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Bike, CalendarRange, Footprints, Waves, Trash2 } from 'lucide-react';
import { Cell, Page, Section, Segmented, Sheet } from '@/components/ios';
import { AthletePicker } from '@/components/workout/AthletePicker';
import { PlanSheet } from '@/components/workout/PlanSheet';
import { StructureEditor, WorkoutSummary } from '@/components/workout/StructureEditor';
import { useDeleteSavedWorkout, useLibrary, usePlans, useSavedWorkouts, useSaveWorkout, useTeam } from '@/hooks/useCoach';
import { useDebounced, useSendWorkout, useWorkoutCheck } from '@/hooks/useCare';
import { formatShortDay } from '@/lib/availability';
import { formatDuration, formatLoad } from '@/lib/format';
import { parseWorkout, SPORT_LABELS, STARTERS, TEMPLATES, workoutStats, type Sport } from '@/lib/workout';
import { convertForSport, formatMeters, formatMinutes } from '@/lib/workoutBlocks';
import type { TrainingPlan } from '@/types';
import type { CareWarning, WorkoutCheckInput } from '@/services/careApi';

interface Draft {
  key: string;
  name: string;
  description: string;
  sport: Sport;
  /** Séance enregistrée en cours de modification. */
  savedId?: string;
}

const SPORT_ICONS = { Ride: Bike, Run: Footprints, Swim: Waves } as const;
const HINTS: Record<Sport, string> = {
  Ride: 'Les % sont relatifs à la FTP (ou à la FC seuil) de chaque athlète.',
  Run: 'Les % sont relatifs à la FC seuil ou à l’allure seuil de chaque athlète, réglées dans Intervals.icu.',
  Swim: 'Les % sont relatifs à l’allure seuil de natation de chaque athlète, réglée dans Intervals.icu.',
};

/** Écran « Séances » : mes séances, séances types, bibliothèque Intervals.icu et plans, par sport. */
export default function Workouts() {
  const [sport, setSport] = useState<Sport>('Ride');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [planOpen, setPlanOpen] = useState<{ plan: TrainingPlan | null } | null>(null);
  const library = useLibrary();
  const plans = usePlans();
  const saved = useSavedWorkouts();
  const open = (d: Omit<Draft, 'key'>, key: string) => setEditing({ ...d, key });
  const mine = (saved.data?.workouts ?? []).filter((w) => w.sport === sport);
  const folders = (library.data?.folders ?? []).map((f) => ({ ...f, workouts: f.workouts.filter((w) => w.sport === sport) })).filter((f) => f.workouts.length);

  return (
    <Page title="Séances" account>
      <div style={{ marginBottom: 12 }}>
        <Segmented<Sport>
          label="Sport"
          value={sport}
          onChange={setSport}
          options={(['Ride', 'Run', 'Swim'] as const).map((s) => ({ value: s, label: SPORT_LABELS[s] }))}
        />
      </div>

      <Section header="Mes séances" footer={mine.length ? undefined : 'Crée une séance et enregistre-la : tu la retrouves ici pour l’envoyer quand tu veux.'}>
        {mine.map((w) => (
          <TemplateCell key={w.id} name={w.name} description={w.description} sport={w.sport} onClick={() => open({ ...w, savedId: w.id }, `saved-${w.id}`)} />
        ))}
        <Cell onClick={() => open({ name: 'Nouvelle séance', description: STARTERS[sport], sport }, `new-${Date.now()}`)} title={<span style={{ color: 'var(--tint)' }}>Créer une séance</span>} />
      </Section>

      <Section header="Séances types" footer={`${HINTS[sport]} La séance arrive sur la montre ou le compteur via Intervals.icu.`}>
        {TEMPLATES.filter((t) => t.sport === sport).map((t) => (
          <TemplateCell key={t.name} {...t} onClick={() => open(t, `app-${t.name}`)} />
        ))}
      </Section>

      {folders.map((f) => (
        <Section key={f.id} header={`Intervals.icu · ${f.name}`}>
          {f.workouts.map((w) => (
            <TemplateCell key={w.id} {...w} onClick={() => open(w, `icu-${w.id}`)} />
          ))}
        </Section>
      ))}
      {library.isError && <p className="section-footer">Bibliothèque Intervals.icu indisponible pour le moment.</p>}

      <Section header="Plans" footer="Une suite de séances sur plusieurs semaines (vélo, course, natation), envoyée d'un coup dans le calendrier des athlètes.">
        {(plans.data?.plans ?? []).map((p) => {
          const weeks = Math.floor(Math.max(0, ...p.workouts.map((w) => w.day)) / 7) + 1;
          return (
            <Cell
              key={p.id}
              inset={52}
              leading={<CalendarRange size={20} color="var(--purple)" aria-hidden />}
              title={p.name}
              subtitle={`${p.workouts.length} séance${p.workouts.length > 1 ? 's' : ''} · ${weeks} semaine${weeks > 1 ? 's' : ''}`}
              onClick={() => setPlanOpen({ plan: p })}
              chevron
            />
          );
        })}
        <Cell onClick={() => setPlanOpen({ plan: null })} title={<span style={{ color: 'var(--tint)' }}>Créer un plan</span>} />
      </Section>

      {editing && <WorkoutSheet key={editing.key} draft={editing} onClose={() => setEditing(null)} />}
      {planOpen && <PlanSheet key={planOpen.plan?.id ?? 'new'} plan={planOpen.plan} onClose={() => setPlanOpen(null)} />}
    </Page>
  );
}

function TemplateCell({ name, description, sport, onClick }: { name: string; description: string; sport: Sport; onClick: () => void }) {
  const s = workoutStats(parseWorkout(description));
  const Icon = SPORT_ICONS[sport];
  const detail = s.complete
    ? s.seconds > 0 && `${formatDuration(s.seconds)} · charge ${formatLoad(s.load)} · intensité ${s.intensity.toLocaleString('fr-FR')}`
    : `${formatMeters(s.meters)}${s.seconds ? ` + ${formatMinutes(s.seconds)}` : ''}`;
  return (
    <Cell
      onClick={onClick}
      chevron
      inset={52}
      leading={<Icon size={20} color="var(--label-2)" aria-hidden />}
      title={name}
      subtitle={detail ? <span className="tabular-nums">{detail}</span> : undefined}
    />
  );
}

/**
 * Une séance : la construire, l'enregistrer dans « Mes séances » (sans
 * l'envoyer), et/ou l'envoyer dans le calendrier d'athlètes choisis.
 */
function WorkoutSheet({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const team = useTeam();
  const assign = useSendWorkout();
  const save = useSaveWorkout();
  const remove = useDeleteSavedWorkout();
  const [savedId, setSavedId] = useState(draft.savedId);
  const [name, setName] = useState(draft.name);
  const [sport, setSport] = useState<Sport>(draft.sport);
  const [description, setDescription] = useState(draft.description);
  const [date, setDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Athlètes pour lesquels l'envoi malgré un blocage (blessure) est confirmé. */
  const [forced, setForced] = useState<Set<string>>(new Set());
  const athletes = team.data?.athletes ?? [];

  // Avertissements : recalculés quand la date, le sport, la structure ou les athlètes changent (anti-rebond 400 ms).
  const checkParams = (): WorkoutCheckInput | null => {
    if (selected.size === 0) return null;
    const steps = parseWorkout(description);
    const stats = workoutStats(steps);
    return {
      athleteIds: [...selected].sort(),
      date,
      sport,
      durationSec: stats.complete ? stats.seconds : null,
      usesPower: steps.some((st) => st.target === 'power'),
      highIntensity: steps.some((st) => Math.max(st.from, st.to) >= 100),
    };
  };
  const paramsKey = JSON.stringify(checkParams());
  const debouncedKey = useDebounced(paramsKey, 400);
  const debounced = useMemo(() => (debouncedKey && debouncedKey !== 'null' ? (JSON.parse(debouncedKey) as WorkoutCheckInput) : null), [debouncedKey]);
  const checkQuery = useWorkoutCheck(debounced);
  const results = checkQuery.data?.results ?? [];
  const nameOf = (id: string) => athletes.find((a) => a.id === id)?.name ?? id;
  /** Athlètes bloqués (un avertissement « block ») et non confirmés : pas d'envoi pour eux. */
  const blockedIds = new Set(results.filter((r) => r.warnings.some((w) => w.level === 'block') && !forced.has(r.id)).map((r) => r.id));
  const sendable = [...selected].filter((id) => !blockedIds.has(id));

  const check = (): string | null => {
    if (!name.trim()) return 'Donne un nom à la séance.';
    if (parseWorkout(description).length === 0) return 'La structure ne contient aucun palier lisible (ex. « - 10m 70% »).';
    return null;
  };

  const changeSport = (next: Sport) => {
    if (next === sport) return;
    setDescription(convertForSport(description, next));
    setSport(next);
  };

  const onSave = async () => {
    setMessage(null);
    const invalid = check();
    if (invalid) return setMessage({ ok: false, text: invalid });
    try {
      const w = await save.mutateAsync({ id: savedId, name: name.trim(), sport, description });
      setSavedId(w.id);
      setMessage({ ok: true, text: savedId ? 'Modifications enregistrées.' : 'Séance enregistrée dans « Mes séances ».' });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  const send = async () => {
    setMessage(null);
    const invalid = check();
    if (invalid) return setMessage({ ok: false, text: invalid });
    if (selected.size === 0) return setMessage({ ok: false, text: 'Choisis au moins un athlète.' });
    if (sendable.length === 0) return setMessage({ ok: false, text: 'Aucun envoi possible : confirme l’envoi malgré la blessure, ou retire l’athlète.' });
    const params = checkParams();
    try {
      const { results: sent } = await assign.mutateAsync({
        ...params!,
        athleteIds: sendable,
        name: name.trim(),
        description,
        force: [...forced].filter((id) => selected.has(id)),
      });
      const blocked = sent.filter((r) => r.blocked);
      const failed = sent.filter((r) => !r.ok && !r.blocked);
      if (blocked.length) setMessage({ ok: false, text: `${blocked.length} athlète(s) non envoyé(s) : blessure en cours. Confirme l’envoi pour eux.` });
      else if (failed.length) setMessage({ ok: false, text: `${failed.length} envoi(s) en échec : ${failed[0].error ?? 'erreur inconnue'}` });
      else onClose();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  const onDelete = async () => {
    if (!savedId) return;
    if (!confirmDelete) return setConfirmDelete(true);
    try {
      await remove.mutateAsync(savedId);
      onClose();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Séance"
      action={
        <button type="button" onClick={onSave} disabled={save.isPending} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="group">
        <input className="field" aria-label="Nom de la séance" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} style={{ fontWeight: 600 }} />
      </div>

      <div style={{ marginTop: 12 }}>
        <Segmented<Sport> label="Sport" value={sport} onChange={changeSport} options={(['Ride', 'Run', 'Swim'] as const).map((s) => ({ value: s, label: SPORT_LABELS[s] }))} />
      </div>

      <div style={{ marginTop: 12 }}>
        <WorkoutSummary description={description} sport={sport} />
      </div>

      <h3 className="section-header">Structure</h3>
      <StructureEditor key={sport} description={description} sport={sport} onChange={setDescription} />

      <h3 className="section-header">Envoyer</h3>
      <div className="group">
        <input type="date" className="field" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <AthletePicker athletes={athletes} selected={selected} onChange={setSelected} />
      {results.some((r) => r.warnings.length) && (
        <div className="group" style={{ marginTop: 12, padding: 12, display: 'grid', gap: 12 }}>
          {results
            .filter((r) => r.warnings.length)
            .map((r) => (
              <AthleteWarnings
                key={r.id}
                name={nameOf(r.id)}
                warnings={r.warnings}
                confirmed={forced.has(r.id)}
                onConfirm={() => setForced((all) => toggle(all, r.id))}
              />
            ))}
        </div>
      )}
      <button
        type="button"
        className="button filled block pressable"
        style={{ marginTop: 14 }}
        disabled={assign.isPending || (selected.size > 0 && sendable.length === 0)}
        onClick={send}
      >
        {assign.isPending
          ? 'Envoi…'
          : selected.size === 0
            ? 'Envoyer'
            : sendable.length === 0
              ? 'Aucun envoi possible'
              : `Envoyer à ${sendable.length} athlète${sendable.length > 1 ? 's' : ''}`}
      </button>
      <p className="section-footer">« Enregistrer » garde la séance dans « Mes séances » sans l’envoyer.</p>

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className="footnote" style={{ color: message.ok ? 'var(--green)' : 'var(--red)', margin: '12px 4px 0' }}>
          {message.text}
        </p>
      )}

      {savedId && (
        <button
          type="button"
          className="pressable"
          onClick={onDelete}
          disabled={remove.isPending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--red)', minHeight: 44, marginTop: 16 }}
        >
          <Trash2 size={16} aria-hidden />
          {confirmDelete ? 'Confirmer la suppression' : 'Supprimer de mes séances'}
        </button>
      )}
    </Sheet>
  );
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Avertissements d'un athlète : orange (à vérifier), rouge (envoi bloqué sans confirmation). */
function AthleteWarnings({ name, warnings, confirmed, onConfirm }: { name: string; warnings: CareWarning[]; confirmed: boolean; onConfirm: () => void }) {
  const blocking = warnings.some((w) => w.level === 'block');
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span className="footnote secondary" style={{ fontWeight: 600 }}>
        {name}
      </span>
      {warnings.map((w, i) => (
        <p key={i} role={w.level === 'block' ? 'alert' : 'status'} className="footnote" style={{ margin: 0, color: w.level === 'block' ? 'var(--red)' : 'var(--orange)' }}>
          <strong>{w.title}</strong> — {w.detail}
          {w.suggestDate && ` Le ${formatShortDay(w.suggestDate)} conviendrait mieux.`}
        </p>
      ))}
      {blocking && (
        <button
          type="button"
          aria-pressed={confirmed}
          onClick={onConfirm}
          className="pressable"
          style={{ justifySelf: 'start', minHeight: 44, color: confirmed ? 'var(--green)' : 'var(--tint)', fontWeight: 600 }}
        >
          {confirmed ? `Envoi confirmé pour ${name}` : `Envoyer quand même à ${name}`}
        </button>
      )}
    </div>
  );
}
