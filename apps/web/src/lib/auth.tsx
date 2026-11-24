import { createContext, useContext, type ReactNode } from 'react';
import { api, configureApi } from '@/services/api';
import { disableDevicePush } from '@/services/push';
import { runtimeConfig } from './runtimeConfig';
import { useLocalSettings } from '@/store/localSettings';

/** Jeton accepté par le BFF seulement en DEMO_MODE (équipe fictive). */
const DEMO_TOKEN = 'demo';

interface AuthCtx {
  /** Connecté (vraie session ou démo). */
  signedIn: boolean;
  demo: boolean;
  /** Redirige vers Intervals.icu (OAuth géré par le BFF). */
  signInWithIntervals: (invite?: string) => void;
  /** Termine la connexion au retour d'Intervals.icu (#code à usage unique). */
  completeSignIn: (code: string) => Promise<void>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
}

const Context = createContext<AuthCtx | undefined>(undefined);

/**
 * Session de l'app : jeton opaque émis par le BFF après la connexion
 * Intervals.icu, gardé sur l'appareil (localStorage). Révoqué côté serveur
 * à la déconnexion ; un 401 du BFF renvoie à l'écran de connexion.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const demo = useLocalSettings((s) => s.demo);
  const session = useLocalSettings((s) => s.session);
  const setDemo = useLocalSettings((s) => s.setDemo);
  const setSession = useLocalSettings((s) => s.setSession);

  // Jeton transmis au client API pendant le rendu : les requêtes lancées par
  // les enfants à ce même rendu doivent déjà le porter.
  configureApi(runtimeConfig.bffUrl, demo ? DEMO_TOKEN : (session ?? ''), () => {
    // Session expirée ou révoquée : retour à l'écran de connexion.
    setSession(null);
    setDemo(false);
  });

  const value: AuthCtx = {
    signedIn: demo || Boolean(session),
    demo,
    signInWithIntervals: (invite) => {
      const url = new URL('/api/public/auth/intervals/start', runtimeConfig.bffUrl);
      if (invite) url.searchParams.set('invite', invite);
      window.location.assign(url.href);
    },
    completeSignIn: async (code) => {
      const { token } = await api.exchangeLoginCode(code);
      setDemo(false);
      setSession(token);
    },
    signInDemo: () => setDemo(true),
    signOut: async () => {
      if (demo) {
        setDemo(false);
        return;
      }
      // Cet appareil ne doit plus recevoir les notifications de ce compte, et
      // la session est révoquée côté serveur. Au mieux 3 s : on déconnecte
      // localement quoi qu'il arrive.
      await Promise.race([
        Promise.allSettled([disableDevicePush(), api.logout()]),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      setSession(null);
    },
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// Le hook vit avec son Provider (même contexte) — compromis assumé sur le fast refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
