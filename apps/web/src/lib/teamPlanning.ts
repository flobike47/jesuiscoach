import type { Group, TeamCalendarAthlete, TeamCalendarDay } from '@/types';
import { parseWorkout, zoneColor } from '@/lib/workout';

/** `rest` : repos prescrit par le coach ; `off` : repos habituel ou indisponibilité (profil). */
export type CellKind = 'free' | 'off' | 'rest' | 'workout' | 'extra';

/**
 * Détermine le type de cellule pour une journée d'athlète. Une séance prime
 * sur tout ; puis le repos prescrit (même si l'athlète a roulé : la consigne
 * reste visible) ; puis la sortie hors plan ; puis les disponibilités.
 */
export function cellKind(day: TeamCalendarDay): CellKind {
  if (day.workouts.length > 0) return 'workout';
  if (day.rest) return 'rest';
  if (day.activities.length > 0) return 'extra';
  if (day.availability === 'repos' || day.availability === 'indisponible') return 'off';
  return 'free';
}

/** Durée en secondes → format court (« 1h », « 45 », « 30m »). */
export function shortDuration(seconds: number | null | undefined): string {
  if (!seconds) return '·';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return m === 1 ? '1 min' : `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Couleur dominante de la séance à partir de la description du workout. */
export function dominantColor(description: string | null | undefined): string {
  const steps = parseWorkout(description ?? '');
  // Zone qui cumule le plus de temps (hors échauffement et récupérations, plus courts).
  const time = new Map<string, number>();
  for (const st of steps) {
    const c = zoneColor(Math.max(st.from, st.to), st.target);
    time.set(c, (time.get(c) ?? 0) + (st.seconds || st.meters * 0.2));
  }
  let best = 'var(--fill-2)';
  let max = 0;
  for (const [c, t] of time) {
    if (t > max) [best, max] = [c, t];
  }
  return best;
}

/** Texte lisible sur une couleur de zone : sombre sur jaune / vert / orange, blanc sinon. */
export function textOn(color: string): string {
  return ['var(--yellow)', 'var(--green)', 'var(--orange)', 'var(--fill-2)', 'var(--label-3)'].includes(color) ? 'rgba(0, 0, 0, 0.85)' : '#fff';
}

/** Filtre les athlètes par groupe (null = tous). */
export function filterByGroup(athletes: TeamCalendarAthlete[], group: Group | null): TeamCalendarAthlete[] {
  if (!group) return athletes;
  return athletes.filter((a) => group.athleteIds.includes(a.id));
}

/** Résumé de sélection pour afficher dans la barre flottante (ex: « Hugo, Léa, Sarah · mercredi 2 »). */
export function selectionSummary(
  cells: Array<{ athleteId: string; date: string }>,
  athletes: TeamCalendarAthlete[],
): string {
  if (cells.length === 0) return '';

  // Regrouper par date et athlète unique
  const uniqueAthletesSet = new Set(cells.map((c) => c.athleteId));
  const uniqueDatesSet = new Set(cells.map((c) => c.date));
  const uniqueAthletes = Array.from(uniqueAthletesSet);
  const uniqueDates = Array.from(uniqueDatesSet).sort();

  // Noms d'athlètes
  const athleteNames = uniqueAthletes.map((id) => {
    const athlete = athletes.find((a) => a.id === id);
    return athlete?.name ?? 'Athlète';
  });

  // Résumé de la date
  let dateStr = '';
  if (uniqueDates.length === 1) {
    const date = new Date(uniqueDates[0]);
    const dayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(date);
    const dayNum = date.getDate();
    dateStr = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum}`;
  } else if (uniqueDates.length <= 3) {
    const dates = uniqueDates.map((d) => new Date(d).getDate());
    dateStr = `${dates.length} jours`;
  } else {
    dateStr = `${uniqueDates.length} jours`;
  }

  return `${athleteNames.join(', ')} · ${dateStr}`;
}

/** Charge tolérée au-dessus de l'habitude (même seuil que le BFF : WEEK_OVERLOAD). */
export const OVERLOAD_RATIO = 1.15;

/** Vérifie si la charge planifiée dépasse la charge habituelle de plus de 15%. */
export function isOverload(load: { planned: number; usual: number | null }): boolean {
  if (load.usual === null) return false;
  return load.planned > load.usual * OVERLOAD_RATIO;
}

/** Compte des séances planifiées et cases libres pour la semaine. */
export function weekCounts(athletes: TeamCalendarAthlete[]): { planned: number; free: number } {
  let planned = 0;
  let free = 0;

  for (const athlete of athletes) {
    for (const day of athlete.days) {
      if (day.workouts.length > 0) {
        planned += 1;
      } else if (day.availability === null && !day.rest) {
        free += 1;
      }
    }
  }

  return { planned, free };
}
