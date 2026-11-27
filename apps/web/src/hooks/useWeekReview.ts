import { useQuery } from '@tanstack/react-query';
import { calendarApi } from '@/services/calendarApi';
import { weekReview } from '@/lib/weekReview';

/** Une semaine passée bouge peu (sorties importées en retard) : on ne la relit pas plus d'une fois par heure. */
const PAST_WEEK_STALE_MS = 60 * 60_000;

/**
 * Résumé de la semaine `from` → `to`. Même clé et même requête que le
 * planning d'équipe (useTeamCalendar) : cache partagé, aucun appel
 * Intervals.icu de plus côté BFF quand le planning vient d'être ouvert.
 */
export const useWeekReview = (from: string, to: string, today: string, enabled = true) =>
  useQuery({
    queryKey: ['team-calendar', from, to],
    queryFn: () => calendarApi.teamCalendar(from, to),
    select: (cal) => weekReview(cal, from, to, today),
    staleTime: to < today ? PAST_WEEK_STALE_MS : 0,
    enabled,
  });
