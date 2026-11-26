import { del, get, post } from '@/services/api';

/** Appareils reliés (phase E) : BFF routes/devices.ts. Jamais de jeton ici. */

export type DeviceProvider = 'wahoo' | 'garmin' | 'coros';

export interface DeviceStatus {
  provider: DeviceProvider;
  label: string;
  /** Lien direct avec le fournisseur ; sinon la connexion passe par Intervals.icu. */
  direct: boolean;
  /** Wahoo configuré sur le serveur (app validée). */
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  lastError: string | null;
}

export const devicesApi = {
  status: (athleteId: string) => get<DeviceStatus[]>(`/athletes/${encodeURIComponent(athleteId)}/devices`),
  connectWahoo: () => post<{ url: string }, Record<string, never>>('/devices/wahoo/connect', {}),
  disconnectWahoo: () => del<{ ok: boolean }>('/devices/wahoo'),
};
