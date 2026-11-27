import dayjs from 'dayjs';
import 'dayjs/locale/fr';

interface RaceLike {
  name: string;
  date: string;
  racePriority?: string | null;
}

/** Prochaine course : la plus proche de priorité A, sinon la plus proche. */
export function nextRace<T extends RaceLike>(races: T[] | undefined, today: string): T | null {
  const future = (races ?? []).filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return future.find((r) => r.racePriority === 'A') ?? future[0] ?? null;
}

const weeksBetween = (fromMonday: string, raceDate: string) => {
  const raceMonday = dayjs(raceDate).subtract((dayjs(raceDate).day() + 6) % 7, 'day');
  return Math.round(raceMonday.diff(dayjs(fromMonday), 'day') / 7);
};

/** « Grand Fond le 8 janvier · dans 6 semaines » (ou « cette semaine », « demain »…). */
export function raceSubtitle(race: RaceLike, today: string): string {
  const days = dayjs(race.date).diff(dayjs(today), 'day');
  const when = days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : days < 7 ? `dans ${days} jours` : `dans ${Math.round(days / 7)} semaines`;
  return `${race.name} le ${dayjs(race.date).locale('fr').format('D MMMM')} · ${when}`;
}

/**
 * Étiquette d'une semaine (lundi) par rapport à la course : « Semaine de
 * course », « Dernière semaine avant la course », « 4 semaines avant la
 * course » ; null après la course ou au-delà de 16 semaines.
 */
export function raceWeekLabel(weekMonday: string, race: RaceLike | null): string | null {
  if (!race) return null;
  const n = weeksBetween(weekMonday, race.date);
  if (n < 0 || n > 16) return null;
  if (n === 0) return `Semaine de course · ${race.name}`;
  if (n === 1) return 'Dernière semaine avant la course';
  return `${n} semaines avant la course`;
}
