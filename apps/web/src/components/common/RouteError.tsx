import { useNavigate, useRouteError } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import { describeRouteError } from '@/lib/routeError';

/**
 * `errorElement` des routes : une exception de rendu ou un chunk introuvable
 * après déploiement affiche ce message au lieu d'une page blanche.
 * `fullPage` : sur les routes racines il n'y a plus de layout autour.
 */
export function RouteError({ fullPage = false }: { fullPage?: boolean }) {
  const error = useRouteError();
  const navigate = useNavigate();
  const view = describeRouteError(error);

  return (
    <div
      role="alert"
      style={
        fullPage
          ? { minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' }
          : { padding: '48px 16px' }
      }
    >
      <div style={{ textAlign: 'center', maxWidth: 360, margin: '0 auto' }}>
        <h1 className="title-2">{view.title}</h1>
        {view.subTitle && <p className="secondary" style={{ margin: '8px 0 20px' }}>{view.subTitle}</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" className="button filled pressable" onClick={() => window.location.reload()}>
            <RotateCw size={18} aria-hidden /> Recharger
          </button>
          <button type="button" className="button tinted pressable" onClick={() => navigate('/')}>
            Retour à l'accueil
          </button>
        </div>
        {(view.detail || view.reqId) && (
          <p className="caption secondary" style={{ marginTop: 16 }}>
            {view.detail && <span style={{ display: 'block' }}>{view.detail}</span>}
            {view.reqId && (
              <span>
                Référence : <code style={{ userSelect: 'all' }}>{view.reqId}</code>
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
