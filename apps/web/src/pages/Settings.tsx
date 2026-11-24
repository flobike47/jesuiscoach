import { useState } from 'react';
import { Bell, Link2, LogOut, Moon } from 'lucide-react';
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

export default function Settings() {
  const { signOut, demo } = useAuth();
  const me = useMe();
  const theme = useLocalSettings((s) => s.theme);
  const setTheme = useLocalSettings((s) => s.setTheme);
  const push = usePushNotifications();
  const [message, setMessage] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

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

      <Section header="Notifications" footer={PUSH_HELP[push.support] ?? 'Une notification à chaque sortie terminée par un athlète, et quand une alerte apparaît.'}>
        <Cell
          inset={52}
          leading={<Bell size={20} color="var(--red)" aria-hidden />}
          title="Sur cet appareil"
          onClick={push.support === 'supported' && !push.busy && !demo ? togglePush : undefined}
          detail={push.support !== 'supported' || demo ? 'Indisponible' : push.deviceSubscribed ? 'Activées' : 'Activer'}
        />
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

      <Section>
        <Cell inset={52} leading={<LogOut size={20} color="var(--red)" aria-hidden />} title={<span style={{ color: 'var(--red)' }}>{demo ? 'Quitter la démo' : 'Se déconnecter'}</span>} onClick={() => signOut()} />
      </Section>
    </Page>
  );
}
