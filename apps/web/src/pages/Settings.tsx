import { useState } from 'react';
import { Bell, Bike, Link2, ListChecks, LogOut, Moon, Repeat, Shield, Trash2, UserRound } from 'lucide-react';
import { inviteMessage } from '@/lib/onboarding';
import { Cell, Page, Section, Segmented, Sheet } from '@/components/ios';
import { useAuth } from '@/lib/auth';
import { useMe } from '@/hooks/useCoach';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useLocalSettings } from '@/store/localSettings';
import { api } from '@/services/api';
import type { ThemeMode } from '@/theme';

const PUSH_HELP: Record<string, string> = {
  'needs-install': "Sur iPhone, installe d'abord l'app sur l'écran d'accueil (Partager → Sur l'écran d'accueil).",
  unsupported: 'Ce navigateur ne gère pas les notifications.',
};

/**
 * En `npm run dev`, aucun service worker n'est installé (lib/pwa.ts) : les
 * notifications ne peuvent pas fonctionner. `npm run preview` sert le build
 * de production en local, service worker compris.
 */
const DEV_HELP = 'Indisponibles en développement (pas de service worker). Lance « npm run preview » pour les tester sur cet ordinateur.';

export default function Settings() {
  const { signOut, signInDemo, demo } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const demoRole = useLocalSettings((s) => s.demoRole);

  const me = useMe();
  const theme = useLocalSettings((s) => s.theme);
  const setTheme = useLocalSettings((s) => s.setTheme);
  const push = usePushNotifications();
  const [message, setMessage] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  const pushReady = push.support === 'supported' && !import.meta.env.DEV;
  const pushHelp = import.meta.env.DEV
    ? DEV_HELP
    : (PUSH_HELP[push.support] ?? 'Une notification à chaque sortie terminée par un athlète, et quand une alerte apparaît.');

  const simulateRide = async () => {
    setMessage(null);
    try {
      const { notification, report } = await api.simulateRide();
      setMessage(report.sent > 0 ? `Notification envoyée : « ${notification.title} ».` : `La notification n'est pas partie (${report.failures[0]?.reason ?? 'aucun appareil abonné'}).`);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const togglePush = async () => {
    setMessage(null);
    try {
      if (push.deviceSubscribed) await push.disable();
      else {
        await push.enable();
        const report = await push.sendTest();
        setMessage(report.sent > 0 ? 'Notification de test envoyée.' : "Abonné, mais la notification de test n'est pas partie.");
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const createInvite = async () => {
    setMessage(null);
    try {
      const { url } = await api.createInvitation();
      const text = inviteMessage(url, me.data?.name);
      // Feuille de partage native (Messages, WhatsApp…) ; sinon le texte complet est copié.
      if (navigator.share) {
        const shared = await navigator.share({ title: 'Rejoins mon équipe', text }).then(
          () => true,
          () => false,
        );
        setInvite(shared ? `Invitation partagée, valable 7 jours : ${url}` : `Partage annulé. Lien valable 7 jours : ${url}`);
      } else {
        const copied = await navigator.clipboard?.writeText(text).then(
          () => true,
          () => false,
        );
        setInvite(copied ? `Invitation copiée (texte et lien), valable 7 jours : ${url}` : `Lien valable 7 jours : ${url}`);
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <Page title="Réglages" back={{ to: '/', label: "Aujourd'hui" }}>
      <Section>
        <Cell title={me.data?.name ?? '…'} subtitle={me.data ? `${me.data.role === 'coach' ? 'Coach' : 'Athlète'}${demo ? ' · démo' : ''}` : undefined} />
        <Cell inset={52} leading={<UserRound size={20} color="var(--blue)" aria-hidden />} title="Mon profil" subtitle="Physiologie, disponibilités, santé" to="/profil" chevron />
        {me.data?.role === 'athlete' && (
          <Cell inset={52} leading={<ListChecks size={20} color="var(--green)" aria-hidden />} title="Bien démarrer" subtitle="Montre reliée, séances sur la montre, notifications" to="/bien-demarrer" chevron />
        )}
      </Section>

      <Section header="Apparence">
        <div className="cell" style={{ display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <Moon size={20} color="var(--indigo)" aria-hidden />
            Thème
          </div>
          <Segmented<ThemeMode>
            label="Thème"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'dark', label: 'Sombre' },
              { value: 'light', label: 'Clair' },
            ]}
          />
        </div>
      </Section>

      <Section header="Notifications" footer={pushHelp}>
        <Cell
          inset={52}
          leading={<Bell size={20} color="var(--red)" aria-hidden />}
          title="Sur cet appareil"
          onClick={pushReady && !push.busy ? togglePush : undefined}
          detail={!pushReady ? 'Indisponible' : push.busy ? '…' : push.deviceSubscribed ? 'Activées' : 'Activer'}
        />
        {demo && demoRole === 'coach' && pushReady && push.deviceSubscribed && (
          <Cell inset={52} leading={<Bike size={20} color="var(--green)" aria-hidden />} title="Simuler une nouvelle sortie" onClick={simulateRide} />
        )}
      </Section>

      {me.data?.role === 'coach' && !demo && (
        <Section header="Équipe" footer={invite ?? 'Un lien à usage unique, avec un court message qui rappelle de relier sa montre ou son compteur directement à Intervals.icu.'}>
          <Cell inset={52} leading={<Link2 size={20} color="var(--blue)" aria-hidden />} title="Inviter un athlète" onClick={createInvite} chevron />
        </Section>
      )}

      {message && (
        <p role="status" className="footnote" style={{ margin: '12px 16px 0', color: 'var(--label-2)' }}>
          {message}
        </p>
      )}

      {demo && (
        <Section header="Démo" footer="La démo côté athlète montre l'app telle que la voit Julie : séance du jour, ressenti, plan et progrès.">
          <Cell
            inset={52}
            leading={<Repeat size={20} color="var(--purple)" aria-hidden />}
            title={demoRole === 'coach' ? 'Voir côté athlète' : 'Voir côté coach'}
            onClick={() => signInDemo(demoRole === 'coach' ? 'athlete' : 'coach')}
          />
        </Section>
      )}

      <Section>
        <Cell inset={52} leading={<Shield size={20} color="var(--label-2)" aria-hidden />} title="Politique de confidentialité" to="/confidentialite" />
      </Section>

      <Section>
        <Cell inset={52} leading={<LogOut size={20} color="var(--red)" aria-hidden />} title={<span style={{ color: 'var(--red)' }}>{demo ? 'Quitter la démo' : 'Se déconnecter'}</span>} onClick={() => signOut()} />
      </Section>

      {!demo && (
        <Section footer="Efface ton compte et tout ce que l'app garde sur toi. Tes données restent dans Intervals.icu.">
          <Cell inset={52} leading={<Trash2 size={20} color="var(--red)" aria-hidden />} title={<span style={{ color: 'var(--red)' }}>Supprimer mon compte</span>} onClick={() => setDeleting(true)} />
        </Section>
      )}
      <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} isCoach={me.data?.role === 'coach'} />
    </Page>
  );
}

/** Confirmation de la suppression : action destructive et définitive, donc une étape explicite. */
function DeleteAccountSheet({ open, onClose, isCoach }: { open: boolean; onClose: () => void; isCoach: boolean }) {
  const { deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
    } catch {
      setError("La suppression n'a pas abouti. Réessaie dans un instant.");
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Supprimer mon compte">
      <div style={{ padding: '8px 20px 24px', display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.45 }}>
          Ton compte, tes ressentis, tes appareils pour les notifications et ton lien avec {isCoach ? 'tes athlètes' : 'ton coach'} seront
          effacés. L'accès de l'app à ton compte Intervals.icu sera coupé.
        </p>
        <p className="footnote secondary" style={{ margin: 0 }}>
          {isCoach
            ? "Tes athlètes gardent leur compte, mais tu ne recevras plus leurs sorties. Tes sorties, ta forme et ton calendrier restent dans Intervals.icu."
            : "Tes sorties, ta forme et ton calendrier restent dans Intervals.icu. Ton coach ne verra plus rien dans l'app."}{' '}
          Cette action est définitive.
        </p>
        {error && (
          <p role="alert" className="footnote" style={{ margin: 0, color: 'var(--red)' }}>
            {error}
          </p>
        )}
        <button type="button" className="button filled block pressable" style={{ background: 'var(--red)' }} disabled={busy} onClick={confirm}>
          {busy ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
      </div>
    </Sheet>
  );
}
