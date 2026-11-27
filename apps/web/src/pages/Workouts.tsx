import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Activity, Bike, CalendarRange, Footprints, Repeat, Search, Sparkles, Star, Type, BarChart3, Waves } from 'lucide-react';
import { SwipeRow } from '@/components/common/SwipeRow';
import { FromActivitySheet } from '@/components/workout/FromActivitySheet';
import { useGroups, useTeamCalendar } from '@/hooks/useTeamPlanning';
import { suggestForWeek } from '@/lib/suggestWeek';
import { Cell, Page, Section } from '@/components/ios';
import { PlanSheet } from '@/components/workout/PlanSheet';
import { RecurringSheet } from '@/components/workout/RecurringSheet';
import { WorkoutComposer } from '@/components/workout/WorkoutComposer';
import { WorkoutProfile } from '@/components/workout/StructureEditor';
import { useLibrary, usePlans, useSavedWorkouts, useToggleFavorite } from '@/hooks/useCoach';
import { formatDuration, formatLoad } from '@/lib/format';
import { kindLabel, workoutKind, type WorkoutKind } from '@/lib/workoutKind';
import { parseWorkout, SPORT_LABELS, STARTERS, TEMPLATES, workoutStats, type Sport } from '@/lib/workout';
import { formatMeters, formatMinutes } from '@/lib/workoutBlocks';
import type { SavedWorkout, TrainingPlan } from '@/types';

interface Draft {
  key: string;
  name: string;
  description: string;
  sport: Sport;
  /** Séance enregistrée en cours de modification. */
  savedId?: string;
  /** Ouvrir la feuille sur la saisie en une ligne. */
  quick?: boolean;
  /** Ouvrir directement sur l'attribution. */
  assign?: boolean;
  /** Athlètes cochés d'avance. */
  athleteIds?: string[];
}

/** Une ligne de la bibliothèque : séance enregistrée, séance type ou séance Intervals.icu. */
interface Entry {
  key: string;
  name: string;
  description: string;
  sport: Sport;
  saved?: SavedWorkout;
  source?: string;
}

const SPORT_ICONS = { Ride: Bike, Run: Footprints, Swim: Waves } as const;
const KINDS: WorkoutKind[] = ['endurance', 'tempo', 'sweet spot', 'seuil', 'vo2', 'sprint', 'récup'];

/** « 1:16 · charge 78 », ou distance pour les séances en mètres. */
function statsLine(description: string): string {
  const s = workoutStats(parseWorkout(description));
  if (!s.complete) return `${formatMeters(s.meters)}${s.seconds ? ` + ${formatMinutes(s.seconds)}` : ''}`;
  return s.seconds > 0 ? `${formatDuration(s.seconds)} · charge ${formatLoad(s.load)}` : '';
}

const sent = (n: number) => (n > 0 ? ` · envoyée ${n} fois` : '');

/** Écran « Séances » : chercher, filtrer, créer, retrouver ses favoris, et les plans. */
export default function Workouts() {
  const [sport, setSport] = useState<Sport>('Ride');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<WorkoutKind | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [planOpen, setPlanOpen] = useState<{ plan: TrainingPlan | null } | null>(null);
  const library = useLibrary();
  const plans = usePlans();
  const saved = useSavedWorkouts();
  const toggleFav = useToggleFavorite();
  const [fromActivity, setFromActivity] = useState(false);
  const [recurring, setRecurring] = useState(false);
  // « Suggéré cette semaine » : 2 semaines passées + la semaine à venir (requête dédiée, distincte de celle du planning d'équipe).
  const today = dayjs().format('YYYY-MM-DD');
  const teamCal = useTeamCalendar(dayjs().subtract(13, 'day').format('YYYY-MM-DD'), dayjs().add(6, 'day').format('YYYY-MM-DD'));
  const groups = useGroups();
  const suggestion = teamCal.data ? suggestForWeek(teamCal.data.athletes, groups.data?.groups ?? [], today) : null;
  const suggestedTemplate = suggestion ? TEMPLATES.find((t) => t.name === suggestion.template && t.sport === sport) : undefined;
  const suggested: Entry | null = suggestedTemplate ? { key: `suggest-${suggestedTemplate.name}`, ...suggestedTemplate } : null;

  const entries = useMemo<Entry[]>(() => {
    const mine = (saved.data?.workouts ?? []).map((w) => ({ key: `saved-${w.id}`, name: w.name, description: w.description, sport: w.sport, saved: w }));
    const templates = TEMPLATES.map((t) => ({ key: `app-${t.name}`, ...t, source: 'Séance type' }));
    const icu = (library.data?.folders ?? []).flatMap((f) => f.workouts.map((w) => ({ key: `icu-${w.id}`, ...w, source: `Intervals.icu · ${f.name}` })));
    return [...mine, ...templates, ...icu].filter((e) => e.sport === sport);
  }, [saved.data, library.data, sport]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => (!kind || workoutKind(e.description) === kind) && (!q || e.name.toLowerCase().includes(q) || kindLabel(workoutKind(e.description)).toLowerCase().includes(q)));
  }, [entries, kind, search]);
  const favorites = visible.filter((e) => e.saved?.favorite);
  const kinds = KINDS.filter((k) => entries.some((e) => workoutKind(e.description) === k));

  const open = (e: Entry, assign = false, athleteIds?: string[]) =>
    setEditing({ key: `${e.key}-${assign}`, name: e.name, description: e.description, sport: e.sport, savedId: e.saved?.id, assign, athleteIds });
  const create = (quick: boolean) =>
    setEditing({ key: `new-${Date.now()}`, name: 'Nouvelle séance', description: quick ? '' : STARTERS[sport], sport, quick });

  return (
    <Page title="Séances" account>
      <label className="search-field">
        <Search size={17} color="var(--label-2)" aria-hidden />
        <input type="search" aria-label="Rechercher une séance" placeholder="« seuil », « sprints », « récup »" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      <div className="chips" role="group" aria-label="Sport">
        {(['Ride', 'Run', 'Swim'] as const).map((s) => {
          const Icon = SPORT_ICONS[s];
          return (
            <button key={s} type="button" className={sport === s ? 'chip active' : 'chip'} aria-pressed={sport === s} onClick={() => (setSport(s), setKind(null))}>
              <Icon size={16} aria-hidden />
              {SPORT_LABELS[s]}
            </button>
          );
        })}
      </div>
      {kinds.length > 1 && (
        <div className="chips" role="group" aria-label="Type de séance">
          <button type="button" className={kind == null ? 'chip active' : 'chip'} aria-pressed={kind == null} onClick={() => setKind(null)}>
            Toutes
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" className={kind === k ? 'chip active' : 'chip'} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
              {kindLabel(k)}
            </button>
          ))}
        </div>
      )}

      <h2 className="section-header">Créer</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <button type="button" className="card pressable create-card" onClick={() => create(true)}>
          <Type size={22} color="var(--blue)" aria-hidden />
          <b>En une ligne</b>
          <span className="footnote secondary">« 3x12 SS r4 »</span>
        </button>
        <button type="button" className="card pressable create-card" onClick={() => create(false)}>
          <BarChart3 size={22} color="var(--yellow)" aria-hidden />
          <b>En blocs</b>
          <span className="footnote secondary">palier par palier</span>
        </button>
        <button type="button" className="card pressable create-card" onClick={() => setFromActivity(true)}>
          <Activity size={22} color="var(--green)" aria-hidden />
          <b>D’une sortie</b>
          <span className="footnote secondary">ses intervalles</span>
        </button>
      </div>

      {suggestion && suggested && (
        <>
          <h2 className="section-header">Suggéré cette semaine</h2>
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Sparkles size={20} color="var(--purple)" aria-hidden style={{ flex: 'none', marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4 }}>{suggestion.message}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--fill)', borderRadius: 12, padding: '10px 12px' }}>
              <span style={{ width: 90, flex: 'none' }}>
                <WorkoutProfile steps={parseWorkout(suggested.description)} sport={suggested.sport} height={26} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 15 }}>{suggested.name}</b>
                <span className="footnote secondary tabular-nums">{statsLine(suggested.description)}</span>
              </span>
              <button type="button" onClick={() => open(suggested, true, suggestion.athleteIds)} style={{ color: 'var(--tint)', fontWeight: 600, minHeight: 44 }}>
                Planifier
              </button>
            </div>
          </div>
        </>
      )}

      {favorites.length > 0 && (
        <>
          <h2 className="section-header">Favoris</h2>
          <div className="scroller">
            {favorites.map((e) => (
              <button key={e.key} type="button" className="card pressable fav-card" onClick={() => open(e)}>
                <WorkoutProfile steps={parseWorkout(e.description)} sport={e.sport} height={26} />
                <b>{e.name}</b>
                <span className="footnote secondary tabular-nums">
                  {formatDuration(workoutStats(parseWorkout(e.description)).seconds)}
                  {sent(e.saved?.sentCount ?? 0)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <Section header={kind ? kindLabel(kind) : 'Toutes'} footer={visible.length === 0 ? 'Aucune séance pour ce filtre.' : 'Les % sont relatifs à la FTP, à la FC seuil ou à l’allure seuil de chaque athlète.'}>
        {visible.map((e, i) => (
          <SwipeRow key={e.key} actionLabel="Planifier" onAction={() => open(e, true)}>
          <div className="cell" style={{ padding: 0, borderTop: i ? '0.5px solid var(--separator)' : undefined }}>
            <button type="button" onClick={() => open(e)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 10px 16px', textAlign: 'left' }}>
              <span style={{ width: 56, flex: 'none' }}>
                <WorkoutProfile steps={parseWorkout(e.description)} sport={e.sport} height={22} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="cell-title" style={{ display: 'block' }}>{e.name}</span>
                <span className="cell-subtitle tabular-nums" style={{ display: 'block' }}>
                  {statsLine(e.description)}
                  {e.saved ? sent(e.saved.sentCount) : e.source ? ` · ${e.source}` : ''}
                </span>
              </span>
            </button>
            {e.saved ? (
              <button
                type="button"
                aria-label={e.saved.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                aria-pressed={e.saved.favorite}
                onClick={() => toggleFav.mutate({ id: e.saved!.id, favorite: !e.saved!.favorite })}
                style={{ minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center', marginRight: 6 }}
              >
                <Star size={20} fill={e.saved.favorite ? 'var(--orange)' : 'none'} color={e.saved.favorite ? 'var(--orange)' : 'var(--label-3)'} aria-hidden />
              </button>
            ) : (
              <span style={{ width: 16 }} />
            )}
          </div>
          </SwipeRow>
        ))}
      </Section>
      {library.isError && <p className="section-footer">Bibliothèque Intervals.icu indisponible pour le moment.</p>}

      <Section header="Plans" footer="Une suite de séances sur plusieurs semaines, envoyée d’un coup dans le calendrier des athlètes.">
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
        <Cell
          onClick={() => setRecurring(true)}
          inset={52}
          leading={<Repeat size={20} color="var(--tint)" aria-hidden />}
          title={<span style={{ color: 'var(--tint)' }}>Programmer une séance récurrente</span>}
          subtitle="La sortie club tous les mardis, pendant 12 semaines au plus"
        />
      </Section>

      {editing && <WorkoutComposer key={editing.key} draft={editing} onClose={() => setEditing(null)} />}
      {fromActivity && (
        <FromActivitySheet
          onClose={() => setFromActivity(false)}
          onPick={(d) => {
            setFromActivity(false);
            setEditing({ key: `activity-${Date.now()}`, name: d.name, description: d.description, sport: 'Ride' });
          }}
        />
      )}
      {recurring && <RecurringSheet onClose={() => setRecurring(false)} />}
      {planOpen && <PlanSheet key={planOpen.plan?.id ?? 'new'} plan={planOpen.plan} onClose={() => setPlanOpen(null)} />}
    </Page>
  );
}
