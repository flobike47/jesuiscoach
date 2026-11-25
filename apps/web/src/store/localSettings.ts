import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '@/theme';

/**
 * Réglages strictement locaux à l'appareil (pas synchronisés) :
 *  - theme : système, sombre ou clair ;
 *  - demo : session de démonstration ouverte sans compte (BFF en DEMO_MODE) ;
 *  - session : jeton de session de l'app (révocable côté BFF, 90 jours).
 */
interface LocalSettings {
  theme: ThemeMode;
  demo: boolean;
  session: string | null;
  /** Côté de la démo : coach (équipe fictive) ou athlète (Julie). */
  demoRole: 'coach' | 'athlete';
  setTheme: (t: ThemeMode) => void;
  setDemo: (d: boolean) => void;
  setSession: (token: string | null) => void;
  setDemoRole: (role: 'coach' | 'athlete') => void;
}

export const useLocalSettings = create<LocalSettings>()(
  persist(
    (set) => ({
      theme: 'system',
      demo: false,
      session: null,
      demoRole: 'coach',
      setTheme: (theme) => set({ theme }),
      setDemo: (demo) => set({ demo }),
      setSession: (session) => set({ session }),
      setDemoRole: (demoRole) => set({ demoRole }),
    }),
    { name: 'jesuiscoach.localSettings' },
  ),
);
