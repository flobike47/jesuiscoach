import { useState } from 'react';
import { Bell, Bike, Link2, LogOut, Moon, Repeat } from 'lucide-react';
import { Cell, Page, Section, Segmented } from '@/components/ios';
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
      setInvite(url);
      if (navigator.share) await navigator.share({ title: 'Rejoins mon équipe', url }).catch(() => undefined);
      else await navigator.clipboard?.writeText(url);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <Page title="Réglages">
      <Section>
        <Cell title={me.data?.name ?? '…'} subtitle={me.data ? `${me.data.role === 'coach' ? 'Coach' : 'Athlète'}${demo ? ' · démo' : ''}` : undefined} />
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
        <Section header="Équipe" footer={invite ? `Lien copié, valable 7 jours : ${invite}` : "Un lien à usage unique : ton ami connecte son compte Intervals.icu et rejoint ton équipe."}>
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
        <Cell inset={52} leading={<LogOut size={20} color="var(--red)" aria-hidden />} title={<span style={{ color: 'var(--red)' }}>{demo ? 'Quitter la démo' : 'Se déconnecter'}</span>} onClick={() => signOut()} />
      </Section>
    </Page>
  );
}
