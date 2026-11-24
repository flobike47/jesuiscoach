import { useState } from 'react';
import { Share, X } from 'lucide-react';
import { shouldShowIosInstallHint } from '@/lib/pwa';

const DISMISS_KEY = 'jesuiscoach.iosInstallHintDismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Safari iOS n'a pas d'invite d'installation : on explique le geste
 * « Partager → Sur l'écran d'accueil ». Indispensable ici : sur iPhone, les
 * notifications de nouvelles sorties n'arrivent que dans l'app installée.
 */
export function IosInstallHint() {
  const [visible, setVisible] = useState(
    () => typeof window !== 'undefined' && shouldShowIosInstallHint(navigator, window) && !readDismissed(),
  );
  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* navigation privée */
    }
    setVisible(false);
  };

  return (
    <aside aria-label="Installer l'application" className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '8px 0' }}>
      <p className="footnote" style={{ margin: 0, flex: 1, lineHeight: 1.45 }}>
        <strong>Installe l'app</strong> pour recevoir les notifications : touche{' '}
        <Share size={15} style={{ verticalAlign: '-2px' }} aria-label="Partager" /> puis « Sur l'écran d'accueil ».
      </p>
      <button type="button" aria-label="Masquer l'aide à l'installation" onClick={dismiss} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', margin: '-12px -12px 0 0', color: 'var(--label-2)' }}>
        <X size={18} />
      </button>
    </aside>
  );
}
