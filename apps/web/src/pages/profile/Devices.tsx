import { useState } from 'react';
import dayjs from 'dayjs';
import { Cell, Page, Section } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { useProfileTarget } from '@/hooks/useProfileTarget';
import { useDeviceMutations, useDevices } from '@/hooks/useDevices';
import type { DeviceStatus } from '@/services/devicesApi';

/** Messages du retour de connexion Wahoo (fragment #wahoo=ok ou #erreur=…). */
const ERRORS: Record<string, string> = {
  refus: 'Connexion Wahoo annulée.',
  session_expiree: 'La connexion a expiré. Recommence.',
  echange_refuse: 'Wahoo n’a pas accepté la connexion. Réessaie.',
  compte_deja_relie: 'Ce compte Wahoo est déjà relié à un autre athlète.',
  requete_invalide: 'Retour de connexion incomplet. Recommence.',
};

function noticeFromHash(hash: string): { ok: boolean; text: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('wahoo') === 'ok') return { ok: true, text: 'Compte Wahoo relié. Tes prochaines séances partiront directement sur ton compteur.' };
  const erreur = params.get('erreur');
  if (erreur) return { ok: false, text: ERRORS[erreur] ?? 'La connexion a échoué. Réessaie.' };
  return null;
}

/** Page « Appareils » de la fiche profil : connexions directes (Wahoo) et via Intervals.icu. Lecture seule pour le coach. */
export default function DevicesPage() {
  const { athleteId, base, self } = useProfileTarget();
  const { data, isLoading, error, refetch } = useDevices(athleteId);
  const { connect, disconnect } = useDeviceMutations();
  // Lu une fois au montage : le retour de Wahoo ne se reproduit pas à chaque rendu.
  const [notice] = useState(() => noticeFromHash(window.location.hash));
  const [confirming, setConfirming] = useState(false);

  const wahoo = data?.find((d) => d.provider === 'wahoo');
  const viaIntervals = data?.filter((d) => !d.direct) ?? [];

  return (
    <Page title="Appareils" back={{ to: base, label: 'Profil' }}>
      {notice && (
        <p role="status" style={{ margin: '0 16px 12px', color: notice.ok ? 'var(--green)' : 'var(--red)', fontSize: 15 }}>
          {notice.text}
        </p>
      )}
      {isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}
      {error && (
        <p style={{ margin: '0 16px', color: 'var(--red)' }}>
          {(error as Error).message}{' '}
          <button type="button" className="button tinted pressable" onClick={() => refetch()}>
            Réessayer
          </button>
        </p>
      )}

      {data && (
        <>
          <Section
            header="Reliés directement"
            footer="Wahoo envoie tes sorties à l'app et reçoit tes séances planifiées. Seules les séances de l'app, datées d'aujourd'hui à J+6, sont envoyées."
          >
            {wahoo && <WahooCells wahoo={wahoo} self={self} connect={connect} disconnect={disconnect} confirming={confirming} setConfirming={setConfirming} />}
          </Section>

          <Section
            header="Via Intervals.icu"
            footer="La connexion directe Garmin et Coros demande un accès partenaire ; en attendant, elles passent par Intervals.icu."
          >
            {viaIntervals.map((d) => (
              <Cell key={d.provider} title={d.label} subtitle="Via Intervals.icu" />
            ))}
            <Cell title="Suunto" subtitle="Via Intervals.icu" />
          </Section>
        </>
      )}
    </Page>
  );
}

interface WahooCellsProps {
  wahoo: DeviceStatus;
  self: boolean;
  connect: ReturnType<typeof useDeviceMutations>['connect'];
  disconnect: ReturnType<typeof useDeviceMutations>['disconnect'];
  confirming: boolean;
  setConfirming: (v: boolean) => void;
}

function WahooCells({ wahoo, self, connect, disconnect, confirming, setConfirming }: WahooCellsProps) {
  const subtitle = !wahoo.configured
    ? 'Bientôt disponible'
    : wahoo.connected
      ? `Relié${wahoo.connectedAt ? ` depuis le ${dayjs(wahoo.connectedAt).format('D MMM YYYY')}` : ''}`
      : 'Non relié';
  return (
    <>
      <Cell title="Wahoo" subtitle={subtitle} detail={wahoo.connected ? 'Relié' : undefined} />
      {wahoo.lastError && <Cell title="Dernière erreur" subtitle={wahoo.lastError} />}
      {self && wahoo.configured && !wahoo.connected && (
        <Cell
          title={<span style={{ color: 'var(--tint)' }}>{connect.isPending ? 'Redirection…' : 'Relier mon compte Wahoo'}</span>}
          onClick={() => connect.mutate()}
        />
      )}
      {self && wahoo.connected && !confirming && (
        <Cell title={<span style={{ color: 'var(--red)' }}>Déconnecter</span>} onClick={() => setConfirming(true)} />
      )}
      {self && wahoo.connected && confirming && (
        <Cell
          title={<span style={{ color: 'var(--red)' }}>{disconnect.isPending ? 'Déconnexion…' : 'Confirmer la déconnexion'}</span>}
          subtitle="Les séances déjà envoyées restent sur ton compteur jusqu'à ce que tu les retires."
          onClick={() => disconnect.mutate(undefined, { onSettled: () => setConfirming(false) })}
        />
      )}
      {(connect.isError || disconnect.isError) && (
        <p role="alert" style={{ margin: '0 16px', color: 'var(--red)', fontSize: 15 }}>
          {((connect.error ?? disconnect.error) as Error).message}
        </p>
      )}
    </>
  );
}

export interface RowProps {
  athleteId: string | undefined;
  base: string;
}

/** Ligne de la fiche : appareils reliés directement (Wahoo) ou via Intervals.icu. */
export function DevicesRow({ athleteId, base }: RowProps) {
  const { data } = useDevices(athleteId);
  const wahooOn = data?.find((d) => d.provider === 'wahoo')?.connected;
  return <Cell title="Appareils" subtitle={wahooOn ? 'Wahoo relié' : 'Via Intervals.icu'} to={`${base}/appareils`} chevron />;
}
