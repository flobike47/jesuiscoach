import { workoutKind, type WorkoutKind } from './workoutKind';
import type { Group, TeamCalendarAthlete } from '@/types';

/** Qualités suivies, de la plus utile à la moins utile en préparation route. */
const TRACKED: Array<{ kind: WorkoutKind; label: string; template: string }> = [
  { kind: 'seuil', label: 'de seuil', template: 'Seuil 3×10' },
  { kind: 'vo2', label: 'de VO2', template: 'VO2max 5×4' },
  { kind: 'sweet spot', label: 'de sweet spot', template: 'Sweet spot 3×12' },
];
/** Au-delà de ce nombre de jours sans une qualité, on la suggère. */
const STALE_DAYS = 10;

export interface WeekSuggestion {
  groupName: string;
  athleteIds: string[];
  kind: WorkoutKind;
  /** Jours depuis la dernière séance de ce type (null : aucune sur la période lue). */
  days: number | null;
  message: string;
  /** Nom de la séance type proposée (TEMPLATES). */
  template: string;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * « Suggéré cette semaine » : pour chaque groupe (ou toute l'équipe), la
 * qualité la plus délaissée parmi seuil, VO2 et sweet spot. Une séance
 * prévue d'ici la fin de la période compte comme couverte. Renvoie la
 * suggestion la plus en retard, ou null si tout est couvert.
 */
export function suggestForWeek(athletes: TeamCalendarAthlete[], groups: Group[], today: string): WeekSuggestion | null {
  const teams = groups.length ? groups : [{ id: 'all', name: 'L’équipe', athleteIds: athletes.map((a) => a.id) }];
  let best: WeekSuggestion | null = null;
  for (const g of teams) {
    const members = athletes.filter((a) => g.athleteIds.includes(a.id) && !a.error);
    if (members.length === 0) continue;
    const firstDay = members[0].days[0]?.date ?? today;
    for (const t of TRACKED) {
      const dates = members.flatMap((a) => a.days.filter((d) => d.workouts.some((w) => w.description && workoutKind(w.description) === t.kind)).map((d) => d.date));
      const last = dates.sort().at(-1);
      if (last && last >= today) continue; // déjà prévue
      const days = last ? daysBetween(last, today) : null;
      if (days != null && days < STALE_DAYS) continue;
      const span = days ?? daysBetween(firstDay, today);
      if (best && (best.days ?? daysBetween(firstDay, today)) >= span) continue;
      const who = g.id === 'all' ? 'L’équipe n’a' : `Le groupe ${g.name} n’a`;
      best = {
        groupName: g.name,
        athleteIds: members.map((a) => a.id),
        kind: t.kind,
        days,
        message: `${who} pas fait de séance ${t.label} ${days != null ? `depuis ${days} jours` : `depuis plus de ${span} jours`}.`,
        template: t.template,
      };
      break; // la qualité la plus utile pour ce groupe suffit
    }
  }
  return best;
}
