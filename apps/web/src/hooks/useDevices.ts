import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '@/services/devicesApi';

/** État des appareils d'un athlète et connexion / déconnexion Wahoo. */

export const useDevices = (athleteId: string | undefined) =>
  useQuery({ queryKey: ['devices', athleteId], queryFn: () => devicesApi.status(athleteId!), enabled: Boolean(athleteId), staleTime: 60_000 });

export function useDeviceMutations() {
  const qc = useQueryClient();
  // Redirige vers Wahoo pour l'autorisation ; le retour ramène sur la page avec #wahoo=ok ou #erreur=….
  const connect = useMutation({ mutationFn: () => devicesApi.connectWahoo(), onSuccess: ({ url }) => window.location.assign(url) });
  const disconnect = useMutation({
    mutationFn: () => devicesApi.disconnectWahoo(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
  return { connect, disconnect };
}
