import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { LineChart, Users, Watch, type LucideIcon } from 'lucide-react';
import { api } from '@/services/api';

const BENEFITS: Array<{ icon: LucideIcon; color: string; title: string; text: string }> = [
  { icon: Users, color: 'var(--orange)', title: 'Qui a besoin de toi, d’un coup d’œil', text: 'Fatigue, séances manquées, sorties du jour : l’équipe triée par urgence.' },
  { icon: Watch, color: 'var(--blue)', title: 'Les séances arrivent sur la montre', text: 'Garmin, Wahoo, Coros… via Intervals.icu, avec les cibles de chacun.' },
  { icon: LineChart, color: 'var(--green)', title: 'La forme expliquée, pas seulement chiffrée', text: 'Un état clair et un conseil, pour toi comme pour tes athlètes.' },
];
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
      <div style={{ display: 'grid', gap: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="logo.svg" alt="" width={60} height={60} style={{ display: 'block', borderRadius: 14 }} />
          <h1 className="large-title">Je suis coach</h1>
        </div>
        {invite ? (
          <p className="secondary" style={{ margin: 0, fontSize: 17, lineHeight: 1.45 }}>
            Ton coach t’invite à rejoindre son équipe. Connecte ton compte Intervals.icu pour partager tes sorties.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 20 }}>
            {BENEFITS.map(({ icon: Icon, color, title, text }) => (
              <li key={title} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
                <span aria-hidden style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
                  <Icon size={24} color={color} />
                </span>
                <span>
                  <span className="headline" style={{ display: 'block' }}>{title}</span>
                  <span className="secondary" style={{ display: 'block', fontSize: 15, lineHeight: 1.4, marginTop: 2 }}>{text}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="footnote" style={{ color: 'var(--red)', margin: 0 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <button type="button" className="button tinted pressable" style={{ minHeight: 46, fontSize: 15 }} onClick={() => signInDemo('coach')}>
              Démo coach
            </button>
            <button type="button" className="button tinted pressable" style={{ minHeight: 46, fontSize: 15 }} onClick={() => signInDemo('athlete')}>
              Démo athlète
            </button>
          </div>
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
          Ton mot de passe ne passe jamais par cette app.{' '}
          <Link to="/confidentialite" style={{ display: 'inline-block', minHeight: 44, lineHeight: '44px' }}>
            Confidentialité
          </Link>
        </p>
      </div>
    </div>
  );
}
