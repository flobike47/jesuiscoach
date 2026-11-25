import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '@/services/api';
import { useAuth } from '@/lib/auth';

const ERRORS: Record<string, string> = {
  refus: 'Connexion annulée sur Intervals.icu.',
  session_expiree: 'La connexion a pris trop de temps. Recommence.',
  echange_refuse: "Intervals.icu n'a pas validé la connexion. Recommence.",
  invitation_requise: "Il te faut une invitation de ton coach pour créer un compte.",
  invitation_invalide: 'Cette invitation a expiré ou a déjà servi. Demande-en une nouvelle à ton coach.',
  requete_invalide: 'Retour de connexion incomplet. Recommence.',
};

export default function Login() {
  const { signedIn, signInWithIntervals, signInDemo } = useAuth();
  const [params] = useSearchParams();
  const invite = params.get('invitation') ?? undefined;
  const error = params.get('erreur');
  const status = useQuery({ queryKey: ['status'], queryFn: api.status, retry: false });

  if (signedIn) return <Navigate to="/" replace />;

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top, 0px) + 64px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)',
        maxWidth: 440,
        margin: '0 auto',
      }}
    >
      <div>
        <img src="logo.svg" alt="" width={72} height={72} style={{ display: 'block', borderRadius: 16 }} />
        <h1 className="large-title" style={{ marginTop: 24 }}>
          Je suis coach
        </h1>
        <p className="secondary" style={{ margin: '8px 0 0', fontSize: 17, lineHeight: 1.45 }}>
          {invite
            ? 'Ton coach t’invite à rejoindre son équipe. Connecte ton compte Intervals.icu pour partager tes sorties.'
            : 'La forme de ton équipe, les sorties du jour et les séances envoyées directement sur les montres et compteurs (Garmin, Coros, Wahoo…).'}
        </p>
        {error && (
          <p role="alert" className="footnote" style={{ color: 'var(--red)', marginTop: 16 }}>
            {ERRORS[error] ?? 'La connexion a échoué. Recommence.'}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {/* Seulement si le serveur confirme que la connexion est configurée :
            sinon le bouton mène à une 503 (serveur injoignable, mode démo). */}
        {status.data?.intervals && (
          <button type="button" className="button filled block pressable" onClick={() => signInWithIntervals(invite)}>
            Se connecter avec Intervals.icu
          </button>
        )}
        {status.data?.demo && (
          <>
            <button type="button" className="button tinted block pressable" onClick={() => signInDemo('coach')}>
              Essayer avec une équipe de démo
            </button>
            <button type="button" className="pressable" style={{ color: 'var(--tint)', minHeight: 44 }} onClick={() => signInDemo('athlete')}>
              Voir la démo côté athlète
            </button>
          </>
        )}
        {status.isError && (
          <div role="alert" style={{ textAlign: 'center' }}>
            <p className="footnote" style={{ margin: 0, color: 'var(--red)' }}>
              Serveur injoignable depuis cette adresse.
            </p>
            <p className="caption secondary" style={{ margin: '4px 0 8px' }}>
              Vérifie ta connexion, ou ouvre l'app sur l'adresse autorisée par le serveur (CORS_ORIGIN).
            </p>
            <button type="button" className="pressable" style={{ color: 'var(--tint)', minHeight: 44 }} onClick={() => status.refetch()}>
              Réessayer
            </button>
          </div>
        )}
        {status.data && !status.data.intervals && !status.data.demo && (
          <p className="footnote secondary" style={{ textAlign: 'center', margin: 0 }}>
            La connexion Intervals.icu n'est pas encore configurée sur ce serveur.
          </p>
        )}
        <p className="caption secondary" style={{ textAlign: 'center', margin: '4px 0 0' }}>
          Tes sorties arrivent de ta montre ou de ton compteur via Intervals.icu. Ton mot de passe ne passe jamais par cette app.
        </p>
        <Link to="/confidentialite" className="caption" style={{ textAlign: 'center', minHeight: 44, lineHeight: '44px' }}>
          Politique de confidentialité
        </Link>
      </div>
    </div>
  );
}
