import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarApi, type EventInput, type EventPatch, type GoalInput } from '@/services/calendarApi';

/** Données du calendrier, de la vue « Aujourd'hui » et des objectifs (BFF : routes/calendar.ts). */

export const useTeamToday = (date: string) => useQuery({ queryKey: ['team-today', date], queryFn: () => calendarApi.teamToday(date) });

export const useGoals = (athleteId: string | undefined) =>
  useQuery({ queryKey: ['goals', athleteId], queryFn: () => calendarApi.goals(athleteId!), enabled: Boolean(athleteId) });

/** Toute écriture du calendrier rafraîchit la semaine, l'équipe et la vue du jour. */
export function useEventMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['calendar'] });
    qc.invalidateQueries({ queryKey: ['team'] });
    qc.invalidateQueries({ queryKey: ['team-today'] });
    qc.invalidateQueries({ queryKey: ['goals'] });
  };
  const create = useMutation({ mutationFn: (v: { athleteId: string; body: EventInput }) => calendarApi.createEvent(v.athleteId, v.body), onSuccess: refresh });
  const update = useMutation({
    mutationFn: (v: { athleteId: string; eventId: string; body: EventPatch }) => calendarApi.updateEvent(v.athleteId, v.eventId, v.body),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (v: { athleteId: string; eventId: string }) => calendarApi.deleteEvent(v.athleteId, v.eventId), onSuccess: refresh });
  const resync = useMutation({ mutationFn: (v: { athleteId: string; eventId: string }) => calendarApi.resyncEvent(v.athleteId, v.eventId), onSuccess: refresh });
  return { create, update, remove, resync };
}

export function useGoalMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['goals'] });
  const create = useMutation({ mutationFn: (v: { athleteId: string; body: GoalInput & { title: string } }) => calendarApi.createGoal(v.athleteId, v.body), onSuccess: refresh });
  const update = useMutation({
    mutationFn: (v: { athleteId: string; goalId: string; body: GoalInput }) => calendarApi.updateGoal(v.athleteId, v.goalId, v.body),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (v: { athleteId: string; goalId: string }) => calendarApi.deleteGoal(v.athleteId, v.goalId), onSuccess: refresh });
  return { create, update, remove };
}
