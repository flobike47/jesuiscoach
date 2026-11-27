import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careApi, type AssignSuggestInput, type CareDay, type CareEquipment, type CareException, type CareInjuryInput, type WorkoutCheckInput, type WorkoutSendInput } from '@/services/careApi';

/** Fiche « soin » d'un athlète (disponibilités, matériel, exceptions, blessures). */
export function useCare(athleteId: string | undefined) {
  return useQuery({ queryKey: ['care', athleteId], queryFn: () => careApi.care(athleteId!), enabled: Boolean(athleteId) });
}

/** Invalide la fiche et le calendrier : une modification change les jours grisés. */
function useInvalidateCare(athleteId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['care', athleteId] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
  };
}

export function useSaveAvailability(athleteId: string | undefined) {
  const done = useInvalidateCare(athleteId);
  return useMutation({
    mutationFn: (body: { weeklyMinutes: number | null; days: CareDay[] }) => careApi.saveAvailability(athleteId!, body),
    onSuccess: done,
  });
}

export function useSaveEquipment(athleteId: string | undefined) {
  const done = useInvalidateCare(athleteId);
  return useMutation({ mutationFn: (body: CareEquipment) => careApi.saveEquipment(athleteId!, body), onSuccess: done });
}

export function useAddException(athleteId: string | undefined) {
  const done = useInvalidateCare(athleteId);
  return useMutation({ mutationFn: (body: Omit<CareException, 'id'>) => careApi.addException(athleteId!, body), onSuccess: done });
}

export function useDeleteException(athleteId: string | undefined) {
  const done = useInvalidateCare(athleteId);
  return useMutation({ mutationFn: (id: string) => careApi.deleteException(athleteId!, id), onSuccess: done });
}

/** Ajout ou modification d'une blessure selon `id`. */
export function useSaveInjury(athleteId: string | undefined) {
  const done = useInvalidateCare(athleteId);
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CareInjuryInput }) => (id ? careApi.updateInjury(athleteId!, id, body) : careApi.addInjury(athleteId!, body)),
    onSuccess: done,
  });
}

export function useDeleteInjury(athleteId: string | undefined) {
  const done = useInvalidateCare(athleteId);
  return useMutation({ mutationFn: (id: string) => careApi.deleteInjury(athleteId!, id), onSuccess: done });
}

/** Avertissements pour une séance, pour les athlètes choisis (aucun quota consommé). */
export function useWorkoutCheck(input: WorkoutCheckInput | null) {
  return useQuery({
    queryKey: ['workout-check', input],
    queryFn: () => careApi.checkWorkout(input!),
    enabled: Boolean(input && input.athleteIds.length > 0),
    placeholderData: (previous) => previous,
  });
}

/** Envoi d'une séance ; invalide le calendrier et l'équipe comme `useAssignWorkout`. */
export function useSendWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkoutSendInput) => careApi.sendWorkout(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

/** Suggestions de placement intelligent pour une séance selon les disponibilités et la forme de chaque athlète. */
export function useAssignSuggest(input: AssignSuggestInput | null) {
  return useQuery({
    queryKey: ['assign-suggest', input],
    queryFn: () => careApi.assignSuggest(input!),
    enabled: Boolean(input && input.athleteIds.length > 0),
    placeholderData: (previous) => previous,
  });
}

/** Valeur qui suit `value` avec un délai (anti-rebond des appels de vérification). */
export function useDebounced<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
