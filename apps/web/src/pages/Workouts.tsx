import { useState } from 'react';
import dayjs from 'dayjs';
import { Bike, CalendarRange, Footprints, Waves, Trash2 } from 'lucide-react';
import { Cell, Page, Section, Segmented, Sheet } from '@/components/ios';
import { AthletePicker } from '@/components/workout/AthletePicker';
import { PlanSheet } from '@/components/workout/PlanSheet';
import { StructureEditor, WorkoutSummary } from '@/components/workout/StructureEditor';
import { useAssignWorkout, useDeleteSavedWorkout, useLibrary, usePlans, useSavedWorkouts, useSaveWorkout, useTeam } from '@/hooks/useCoach';
import { formatDuration } from '@/lib/format';
import { parseWorkout, SPORT_LABELS, STARTERS, TEMPLATES, workoutStats, type Sport } from '@/lib/workout';
import { convertForSport, formatMeters, formatMinutes } from '@/lib/workoutBlocks';
import type { TrainingPlan } from '@/types';

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
    <Page title="Séances">
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
    ? s.seconds > 0 && `${formatDuration(s.seconds)} · charge ${s.load} · intensité ${s.intensity.toLocaleString('fr-FR')}`
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
  const assign = useAssignWorkout();
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
  const athletes = team.data?.athletes ?? [];

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
    try {
      const { results } = await assign.mutateAsync({ athleteIds: [...selected], date, name: name.trim(), description, sport });
      const failed = results.filter((r) => !r.ok);
      if (failed.length) setMessage({ ok: false, text: `${failed.length} envoi(s) en échec : ${failed[0].error ?? 'erreur inconnue'}` });
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
      <button type="button" className="button filled block pressable" style={{ marginTop: 14 }} disabled={assign.isPending} onClick={send}>
        {assign.isPending ? 'Envoi…' : selected.size ? `Envoyer à ${selected.size} athlète${selected.size > 1 ? 's' : ''}` : 'Envoyer'}
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
