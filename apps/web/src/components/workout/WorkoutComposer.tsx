import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { Segmented, Sheet } from '@/components/ios';
import { AthletePicker } from '@/components/workout/AthletePicker';
import { SmartAssign } from '@/components/workout/SmartAssign';
import { StructureEditor, WorkoutSummary } from '@/components/workout/StructureEditor';
import { useDeleteSavedWorkout, useMarkUsed, useSaveWorkout, useTeam } from '@/hooks/useCoach';
import { useDebounced, useSendWorkout, useWorkoutCheck } from '@/hooks/useCare';
import { formatShortDay } from '@/lib/availability';
import { parseQuick, variantOf, type Variant } from '@/lib/quickWorkout';
import { parseWorkout, SPORT_LABELS, workoutStats, type Sport } from '@/lib/workout';
import { formatDuration, formatLoad } from '@/lib/format';
import { convertForSport } from '@/lib/workoutBlocks';
import type { CareWarning, WorkoutCheckInput } from '@/services/careApi';

interface Draft {
  key: string;
  name: string;
  description: string;
  sport: Sport;
  savedId?: string;
  /** Ouvrir sur la saisie en une ligne. */
  quick?: boolean;
  /** Ouvrir directement l'étape « Attribuer ». */
  assign?: boolean;
  /** Athlètes cochés d'avance (ex. le groupe visé par une suggestion). */
  athleteIds?: string[];
}

type Step = 'workout' | 'assign';

/**
 * Compositeur de séance en deux étapes :
 * 1. « Séance » : description rapide, structure, variantes
 * 2. « Attribuer » : date, athlètes, avertissements, envoi
 */
export function WorkoutComposer({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const team = useTeam();
  const assign = useSendWorkout();
  const save = useSaveWorkout();
  const remove = useDeleteSavedWorkout();
  const markUsed = useMarkUsed();

  const [step, setStep] = useState<Step>(draft.assign ? 'assign' : 'workout');
  const [savedId, setSavedId] = useState(draft.savedId);
  const [name, setName] = useState(draft.name);
  const [sport, setSport] = useState<Sport>(draft.sport);
  const [description, setDescription] = useState(draft.description);
  const [date, setDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(draft.athleteIds));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [forced, setForced] = useState<Set<string>>(new Set());

  const athletes = team.data?.athletes ?? [];

  // Saisie en une ligne : elle produit la description ; le nom suit tant qu'il n'a pas été retouché.
  const [quick, setQuick] = useState('');
  const [nameTouched, setNameTouched] = useState(Boolean(draft.savedId));
  /** Description « standard » : les variantes en dérivent. */
  const [base, setBase] = useState(draft.description);
  const [variant, setVariant] = useState<Variant>('standard');
  const quickParsed = useMemo(() => (quick.trim() ? parseQuick(quick) : null), [quick]);
  const effectiveDescription = description;

  const onQuick = (value: string) => {
    setQuick(value);
    const r = parseQuick(value);
    if (!r.text) return;
    setBase(r.text);
    setDescription(r.text);
    setVariant('standard');
    if (!nameTouched) setName(r.name);
  };
  const applyVariant = (v: Variant) => {
    setVariant(v);
    setDescription(v === 'standard' ? base : variantOf(base, v));
  };
  const onStructure = (text: string) => {
    setDescription(text);
    setBase(text);
    setVariant('standard');
  };
  const variants: Array<{ value: Variant; label: string }> = [
    { value: 'courte', label: 'Courte' },
    { value: 'standard', label: 'Standard' },
    { value: 'longue', label: 'Longue' },
  ];

  // Avertissements
  const checkParams = (): WorkoutCheckInput | null => {
    if (selected.size === 0) return null;
    const steps = parseWorkout(effectiveDescription);
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
  const blockedIds = new Set(results.filter((r) => r.warnings.some((w) => w.level === 'block') && !forced.has(r.id)).map((r) => r.id));
  const sendable = [...selected].filter((id) => !blockedIds.has(id));

  const check = (): string | null => {
    if (!name.trim()) return 'Donne un nom à la séance.';
    if (parseWorkout(effectiveDescription).length === 0) return 'La structure ne contient aucun palier lisible (ex. « - 10m 70% »).';
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
      const w = await save.mutateAsync({ id: savedId, name: name.trim(), sport, description: effectiveDescription });
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
    if (sendable.length === 0) return setMessage({ ok: false, text: 'Aucun envoi possible : confirme l\'envoi malgré la blessure, ou retire l\'athlète.' });
    const params = checkParams();
    try {
      const { results: sent } = await assign.mutateAsync({
        ...params!,
        athleteIds: sendable,
        name: name.trim(),
        description: effectiveDescription,
        force: [...forced].filter((id) => selected.has(id)),
      });

      // Marquer la séance utilisée si elle est enregistrée
      if (savedId && sent.every((r) => r.ok)) {
        await markUsed.mutateAsync({ id: savedId, count: sendable.length });
      }

      const blocked = sent.filter((r) => r.blocked);
      const failed = sent.filter((r) => !r.ok && !r.blocked);
      if (blocked.length) setMessage({ ok: false, text: `${blocked.length} athlète(s) non envoyé(s) : blessure en cours. Confirme l'envoi pour eux.` });
      else if (failed.length) setMessage({ ok: false, text: `${failed.length} envoi(s) en échec : ${failed[0].error ?? 'erreur inconnue'}` });
      else onClose();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  const [placement, setPlacement] = useState<'smart' | 'same'>('smart');
  const [progress, setProgress] = useState<string | null>(null);

  /** Envoi par lots (un jour et une variante par lot), avec les vérifications serveur habituelles. */
  const sendSmart = async (groups: Array<{ date: string; description: string; athleteIds: string[] }>, notify: boolean) => {
    setMessage(null);
    const invalid = check();
    if (invalid) return setMessage({ ok: false, text: invalid });
    const errors: string[] = [];
    let done = 0;
    for (const [i, g] of groups.entries()) {
      setProgress(`Envoi ${i + 1} / ${groups.length}…`);
      const steps = parseWorkout(g.description);
      const stats = workoutStats(steps);
      try {
        const { results: sent } = await assign.mutateAsync({
          athleteIds: g.athleteIds,
          date: g.date,
          sport,
          durationSec: stats.complete ? stats.seconds : null,
          usesPower: steps.some((st) => st.target === 'power'),
          highIntensity: steps.some((st) => Math.max(st.from, st.to) >= 100),
          name: name.trim(),
          description: g.description,
          force: [],
          notify,
        });
        done += sent.filter((r) => r.ok).length;
        for (const r of sent.filter((x) => !x.ok)) errors.push(`${nameOf(r.id)} : ${r.blocked ? 'blessure en cours' : (r.error ?? 'échec')}`);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    setProgress(null);
    if (savedId && done > 0) await markUsed.mutateAsync({ id: savedId, count: done }).catch(() => undefined);
    if (errors.length) setMessage({ ok: false, text: `${done} séance(s) planifiée(s). ${errors.join(' · ')}` });
    else onClose();
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

  if (step === 'assign') {
    return (
      <Sheet
        open
        onClose={onClose}
        title="Attribuer"
        action={
          <button
            type="button"
            onClick={() => setStep('workout')}
            disabled={false}
            style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ChevronLeft size={16} />
            Séance
          </button>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <Segmented<'smart' | 'same'>
            label="Placement"
            value={placement}
            onChange={setPlacement}
            options={[
              { value: 'smart', label: 'Meilleur jour pour chacun' },
              { value: 'same', label: 'Même jour pour tous' },
            ]}
          />
        </div>

        {placement === 'smart' ? (
          <SmartAssign baseDescription={description} sport={sport} athletes={athletes} selected={selected} onSelected={setSelected} onSend={sendSmart} isPending={assign.isPending} />
        ) : (
          <>
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
          </>
        )}
        {progress && <p role="status" className="footnote secondary" style={{ margin: '12px 4px 0' }}>{progress}</p>}
        <p className="section-footer">« Enregistrer » garde la séance dans « Mes séances » sans l'envoyer.</p>

        {message && (
          <p role={message.ok ? 'status' : 'alert'} className="footnote" style={{ color: message.ok ? 'var(--green)' : 'var(--red)', margin: '12px 4px 0' }}>
            {message.text}
          </p>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nouvelle séance"
      action={
        <button
          type="button"
          onClick={onSave}
          disabled={save.isPending}
          style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="group" style={{ padding: '10px 16px' }}>
        <label htmlFor="quick" className="footnote secondary" style={{ display: 'block' }}>
          Décris-la en une ligne
        </label>
        <input
          id="quick"
          className="field"
          autoFocus={draft.quick}
          value={quick}
          placeholder="« 3x12 SS r4 », « 15' échauf, 2x20 à 95% r5, 10' calme »"
          maxLength={255}
          onChange={(e) => onQuick(e.target.value)}
          style={{ padding: '4px 0', minHeight: 36 }}
        />
      </div>
      {quickParsed && (quickParsed.tokens.length > 0 || quickParsed.unknown.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }} aria-label="Ce qui a été compris">
          {quickParsed.tokens.map((t, i) => (
            <span key={i} className="token" style={{ ['--token' as string]: t.kind === 'interval' || t.kind === 'steady' ? 'var(--orange)' : t.kind === 'warmup' ? 'var(--blue)' : 'var(--gray)' }}>
              {t.label}
            </span>
          ))}
          {quickParsed.unknown.map((u, i) => (
            <span key={`u${i}`} className="token" style={{ ['--token' as string]: 'var(--red)' }} title="Non compris">
              {u} ?
            </span>
          ))}
        </div>
      )}

      <div className="group" style={{ marginTop: 16 }}>
        <input
          className="field"
          aria-label="Nom de la séance"
          value={name}
          maxLength={120}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          style={{ fontWeight: 600 }}
        />
      </div>
      {!nameTouched && quickParsed && <p className="section-footer">Nom proposé d’après la séance : tu peux le modifier.</p>}

      <div style={{ marginTop: 12 }}>
        <Segmented<Sport>
          label="Sport"
          value={sport}
          onChange={changeSport}
          options={(['Ride', 'Run', 'Swim'] as const).map((s) => ({ value: s, label: SPORT_LABELS[s] }))}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <WorkoutSummary description={description} sport={sport} />
      </div>

      <h3 className="section-header">Variantes</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }} role="radiogroup" aria-label="Variante">
        {variants.map((v) => {
          const text = v.value === 'standard' ? base : variantOf(base, v.value);
          const st = workoutStats(parseWorkout(text));
          const reps = text.match(/^(\d+)x$/m)?.[1];
          return (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={variant === v.value}
              className="card pressable"
              onClick={() => applyVariant(v.value)}
              style={{ textAlign: 'left', display: 'grid', gap: 4, padding: 10, background: 'var(--fill)', boxShadow: variant === v.value ? 'inset 0 0 0 2px var(--tint)' : undefined }}
            >
              <span className="caption secondary">{v.label}</span>
              <b className="tabular-nums">{reps ? `${reps} répétition${Number(reps) > 1 ? 's' : ''}` : formatDuration(st.seconds)}</b>
              <span className="caption secondary tabular-nums">
                {formatDuration(st.seconds)} · charge {formatLoad(st.load)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="section-footer">À l’attribution, chaque athlète peut recevoir la variante adaptée à sa forme.</p>

      <h3 className="section-header">Structure</h3>
      <StructureEditor key={`${sport}-${base.length}-${variant}`} description={description} sport={sport} onChange={onStructure} />

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className="footnote" style={{ color: message.ok ? 'var(--green)' : 'var(--red)', margin: '12px 4px 0' }}>
          {message.text}
        </p>
      )}

      <div style={{ padding: '12px 0 34px', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 10, marginTop: 20 }}>
        <button
          type="button"
          style={{
            minHeight: 50,
            padding: '0 16px',
            borderRadius: 14,
            background: 'rgba(118,118,128,.24)',
            color: 'var(--tint)',
            fontWeight: 600,
            fontSize: 15,
            border: 0,
            cursor: 'pointer',
          }}
          disabled={save.isPending}
          onClick={onSave}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
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
          }}
          onClick={() => setStep('assign')}
        >
          Attribuer…
        </button>
      </div>

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
