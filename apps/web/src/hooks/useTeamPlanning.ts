import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarApi } from '@/services/calendarApi';

export const useTeamCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: ['team-calendar', from, to],
    queryFn: () => calendarApi.teamCalendar(from, to),
  });

export const useGroups = () =>
  useQuery({
    queryKey: ['groups'],
    queryFn: () => calendarApi.groups(),
  });

export function useGroupMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['team-calendar'] });
  };
  const create = useMutation({
    mutationFn: (body: { name: string; athleteIds: string[] }) => calendarApi.createGroup(body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; name?: string; athleteIds?: string[] }) =>
      calendarApi.updateGroup(v.id, { name: v.name, athleteIds: v.athleteIds }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => calendarApi.deleteGroup(id),
    onSuccess: refresh,
  });
  return { create, update, remove };
}
