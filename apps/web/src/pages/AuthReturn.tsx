import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { PageLoader } from '@/components/common/PageLoader';

/**
 * Retour d'Intervals.icu via le BFF : `#code=…` (code de connexion à usage
 * unique, 60 s) ou `#error=…`. Le fragment n'est jamais envoyé à un serveur.
 */
export default function AuthReturn() {
  const { completeSignIn } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Efface le code de l'URL (historique, capture d'écran).
    window.history.replaceState(null, '', window.location.pathname);
    const code = params.get('code');
    if (!code) {
      navigate(`/connexion?erreur=${encodeURIComponent(params.get('error') ?? 'requete_invalide')}`, { replace: true });
      return;
    }
    // Première connexion d'un athlète invité : écran « Bien démarrer ».
    const next = params.get('bienvenue') === '1' ? '/bien-demarrer' : '/';
    completeSignIn(code).then(
      () => navigate(next, { replace: true }),
      () => navigate('/connexion?erreur=echange_refuse', { replace: true }),
    );
  }, [completeSignIn, navigate]);

  return <PageLoader />;
}
