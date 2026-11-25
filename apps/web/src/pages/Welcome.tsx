import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ExternalLink, HelpCircle } from 'lucide-react';
import { Cell, Page, Section } from '@/components/ios';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { buildChecklist, INTERVALS_SETTINGS_URL, type Step, type StepState } from '@/lib/onboarding';
import { isIos, isStandalone } from '@/lib/pwa';
import { api } from '@/services/api';

const ICONS: Record<StepState, { Icon: typeof Circle; color: string; label: string }> = {
  done: { Icon: CheckCircle2, color: 'var(--green)', label: 'Fait' },
  todo: { Icon: Circle, color: 'var(--orange)', label: 'À faire' },
  unknown: { Icon: HelpCircle, color: 'var(--label-2)', label: 'À vérifier' },
};

/**
 * « Bien démarrer » : ouvert automatiquement après l'inscription d'un athlète
 * invité, puis depuis Réglages. Ce qui est lisible est vérifié pour de vrai ;
 * le reste est marqué « à vérifier ».
 */
export default function Welcome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setup = useQuery({ queryKey: ['setup'], queryFn: () => api.setup(), staleTime: 60_000 });
  const push = usePushNotifications();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // En développement, pas de service worker : notifications indisponibles.
  const pushSupport = import.meta.env.DEV ? 'unsupported' : push.support;
  const steps = useMemo(
    () =>
      buildChecklist(setup.data, {
        standalone: isStandalone(navigator, window),
        ios: isIos(navigator),
        push: pushSupport,
        pushSubscribed: push.deviceSubscribed,
      }),
    [setup.data, pushSupport, push.deviceSubscribed],
  );
  const remaining = steps.filter((s) => s.state !== 'done').length;
  const intervalsTodo = steps.some((s) => (s.key === 'garmin' || s.key === 'workouts') && s.state !== 'done');

  const recheck = async () => {
    setChecking(true);
    setMessage(null);
    try {
      qc.setQueryData(['setup'], await api.setup(true));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const enablePush = async () => {
    setMessage(null);
    try {
      await push.enable();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <Page
      title="Bien démarrer"
      back={{ to: '/reglages', label: 'Réglages' }}
      header={
        <p className="secondary" style={{ margin: '-4px 0 12px', fontSize: 17, lineHeight: 1.45 }}>
          {remaining === 0 ? 'Tout est prêt : tes sorties arrivent chez ton coach et ses séances sur ta montre.' : `Encore ${remaining} étape${remaining > 1 ? 's' : ''} pour que tes sorties arrivent chez ton coach et ses séances sur ta montre.`}
        </p>
      }
    >
      <Section header="Intervals.icu et Garmin" footer={setup.isError ? 'Réglages Intervals.icu illisibles pour le moment : vérifie-les directement.' : undefined}>
        {steps.slice(0, 2).map((s) => (
          <StepCell key={s.key} step={s} loading={setup.isLoading} />
        ))}
        {intervalsTodo && (
          <Cell
            inset={52}
            leading={<ExternalLink size={20} color="var(--tint)" aria-hidden />}
            title={<span style={{ color: 'var(--tint)' }}>Ouvrir les réglages Intervals.icu</span>}
            onClick={() => window.open(INTERVALS_SETTINGS_URL, '_blank', 'noopener')}
          />
        )}
        <Cell inset={52} leading={<span aria-hidden style={{ width: 20 }} />} title={<span style={{ color: 'var(--tint)' }}>{checking ? 'Vérification…' : 'Revérifier'}</span>} onClick={checking ? undefined : recheck} />
      </Section>

      <Section header="Cet appareil">
        {steps.slice(2).map((s) => (
          <StepCell key={s.key} step={s} />
        ))}
        {steps[3].state === 'todo' && pushSupport === 'supported' && (
          <Cell
            inset={52}
            leading={<span aria-hidden style={{ width: 20 }} />}
            title={<span style={{ color: 'var(--tint)' }}>{push.busy ? 'Activation…' : 'Activer les notifications'}</span>}
            onClick={push.busy ? undefined : enablePush}
          />
        )}
      </Section>

      {message && (
        <p role="status" className="footnote" style={{ margin: '0 16px 12px', color: 'var(--label-2)' }}>
          {message}
        </p>
      )}

      <p className="section-footer" style={{ marginTop: 0 }}>
        Ton coach voit tes sorties, ta forme et ton ressenti, rien d’autre. <Link to="/confidentialite">Politique de confidentialité</Link>
      </p>

      <div style={{ padding: '8px 0 24px' }}>
        <button type="button" className="button filled block pressable" onClick={() => navigate('/', { replace: true })}>
          {remaining === 0 ? 'C’est parti' : 'Continuer'}
        </button>
      </div>
    </Page>
  );
}

function StepCell({ step, loading }: { step: Step; loading?: boolean }) {
  const { Icon, color, label } = ICONS[step.state];
  return (
    <Cell
      inset={52}
      leading={<Icon size={22} color={loading ? 'var(--label-3)' : color} aria-label={loading ? 'Vérification' : label} />}
      title={step.title}
      subtitle={loading ? 'Vérification…' : (step.help ?? undefined)}
      detail={loading ? undefined : <span style={{ color }}>{label}</span>}
    />
  );
}
