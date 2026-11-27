import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { profileApi, type IdentityValues, type PhysioValues, type ProfileView, type Suggestion } from '@/services/profileApi';
import type { Sport } from '@/types';

/**
 * Fiche profil. Les écritures renvoient la fiche complète : on la pose dans le
 * cache, puis on rafraîchit ce qui dépend des valeurs (zones, puissance, fiche
 * athlète), car une FTP ou un poids changent les calculs.
 */

function afterWrite(qc: QueryClient, athleteId: string, data: ProfileView) {
  qc.setQueryData(['profile', athleteId], data);
  qc.invalidateQueries({ queryKey: ['athlete', athleteId] });
  qc.invalidateQueries({ queryKey: ['power', athleteId] });
  qc.invalidateQueries({ queryKey: ['zones', athleteId] });
  // Une pesée enregistrée rejoint la courbe du poids.
  qc.invalidateQueries({ queryKey: ['weight', athleteId] });
}

export function useProfile(athleteId: string | undefined) {
  return useQuery({
    queryKey: ['profile', athleteId],
    queryFn: () => profileApi.get(athleteId!),
    enabled: Boolean(athleteId),
    staleTime: 60_000,
  });
}

export function useSaveIdentity(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IdentityValues>) => profileApi.saveIdentity(athleteId, body),
    onSuccess: (data) => afterWrite(qc, athleteId, data),
  });
}

export function useSavePhysiology(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sport, body }: { sport: Sport; body: Partial<PhysioValues> }) => profileApi.savePhysiology(athleteId, sport, body),
    onSuccess: (data) => afterWrite(qc, athleteId, data),
  });
}

export function useSaveVma(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vmaKmh: number | null) => profileApi.saveVma(athleteId, vmaKmh),
    onSuccess: (data) => afterWrite(qc, athleteId, data),
  });
}

export function useAcceptSuggestion(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: Suggestion) => profileApi.acceptSuggestion(athleteId, s.sport, s.field),
    onSuccess: (data) => afterWrite(qc, athleteId, data),
  });
}

export function useTests(athleteId: string | undefined) {
  return useQuery({
    queryKey: ['profile-tests', athleteId],
    queryFn: () => profileApi.tests(athleteId!),
    enabled: Boolean(athleteId),
  });
}

export function useAddTest(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof profileApi.addTest>[1]) => profileApi.addTest(athleteId, body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ['profile-tests', athleteId] });
      // Un test « mettre à jour mon profil » change la fiche.
      if (body.apply) {
        qc.invalidateQueries({ queryKey: ['profile', athleteId] });
        qc.invalidateQueries({ queryKey: ['athlete', athleteId] });
        qc.invalidateQueries({ queryKey: ['power', athleteId] });
        qc.invalidateQueries({ queryKey: ['zones', athleteId] });
      }
    },
  });
}

export function useDeleteTest(athleteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) => profileApi.deleteTest(athleteId, testId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-tests', athleteId] }),
  });
}
