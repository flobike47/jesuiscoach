import axios, { type AxiosInstance } from 'axios';
import { runtimeConfig } from '@/lib/runtimeConfig';
import type { PushTestReport } from '@/lib/push';
import type { Checkin, TodayView, PlannedEvent, AthleteOverview, AthleteSummary, CalendarRange, FeedItem, Me, PublicStatus, PowerView, ZonesView, ActivityView, LibraryFolder, TrainingPlan, PlanWorkout, ApplyPlanResult, SetupStatus, SavedWorkout, Sport } from '@/types';

/**
 * Client unique vers le BFF. Toutes les requêtes portent le jeton de session
 * de l'app (Bearer). Aucune clé côté navigateur.
 *
 * `baseURL` est initialisé dès le chargement du module à partir de
 * runtimeConfig ; le jeton est posé par AuthProvider (lib/auth.tsx).
 */

/** Requêtes de données : Intervals.icu peut être lent au premier appel non mis en cache. */
const DEFAULT_TIMEOUT_MS = 20_000;

let baseURL = runtimeConfig.bffUrl.replace(/\/+$/, '');
let token = '';
let client: AxiosInstance | null = null;
let onUnauthorized: (() => void) | null = null;

export function configureApi(url: string, t: string, unauthorized?: () => void) {
  onUnauthorized = unauthorized ?? null;
  const nextBase = url.replace(/\/+$/, '');
  if (nextBase === baseURL && t === token) return;
  baseURL = nextBase;
  token = t;
  client = null;
}

/** Erreur renvoyée par le BFF : message lisible + reqId pour retrouver le log serveur. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public reqId: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Extrait `{ error, reqId }` du corps, y compris pour les réponses binaires. */
function readErrorBody(data: unknown): { error?: string; reqId?: string } {
  try {
    // toString plutôt qu'instanceof : robuste aux ArrayBuffer d'un autre realm
    if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') {
      data = JSON.parse(new TextDecoder().decode(data as ArrayBuffer));
    }
    if (data && typeof data === 'object') return data as { error?: string; reqId?: string };
  } catch {
    /* corps non JSON */
  }
  return {};
}

export function toApiError(err: unknown): ApiError {
  if (!axios.isAxiosError(err)) return new ApiError((err as Error)?.message ?? 'Erreur inconnue', null, null);
  if (err.code === 'ECONNABORTED') return new ApiError('Le serveur met trop de temps à répondre.', null, null);
  if (!err.response) return new ApiError('Serveur injoignable. Vérifie ta connexion.', null, null);
  const body = readErrorBody(err.response.data);
  return new ApiError(
    body.error ?? `Erreur ${err.response.status}`,
    err.response.status,
    body.reqId ?? null,
  );
}

function getClient(): AxiosInstance {
  if (!client) {
    client = axios.create({
      baseURL: baseURL || (typeof window !== 'undefined' ? window.location.origin : ''),
      timeout: DEFAULT_TIMEOUT_MS,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    client.interceptors.response.use(undefined, (err) => {
      const apiError = toApiError(err);
      // Session expirée ou révoquée (hors routes publiques) : déconnexion locale.
      const url = axios.isAxiosError(err) ? (err.config?.url ?? '') : '';
      if (apiError.status === 401 && !url.startsWith('/api/public/')) onUnauthorized?.();
      return Promise.reject(apiError);
    });
  }
  return client;
}

async function get<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await getClient().get<T>(`/api${path}`, { params, signal });
  return res.data;
}

async function post<T, B = unknown>(path: string, body: B): Promise<T> {
  const res = await getClient().post<T>(`/api${path}`, body);
  return res.data;
}

async function put<T, B = unknown>(path: string, body: B): Promise<T> {
  const res = await getClient().put<T>(`/api${path}`, body);
  return res.data;
}

async function del<T>(path: string, body?: unknown): Promise<T> {
  const res = await getClient().delete<T>(`/api${path}`, { data: body });
  return res.data;
}

/** Appels bruts, pour les modules d'API séparés (services/profileApi.ts, services/careApi.ts). */
export { get, post, put, del };

export interface AssignResult {
  results: Array<{ id: string; ok: boolean; error?: string }>;
}

export const api = {
  status: () => get<PublicStatus>('/public/status'),
  me: () => get<Me>('/me'),
  setup: (refresh = false) => get<SetupStatus>('/me/setup', refresh ? { refresh: 1 } : undefined),
  team: () => get<{ athletes: AthleteSummary[]; errors: Array<{ id: string; error: string }> }>('/team'),
  feed: () => get<{ items: FeedItem[] }>('/feed'),
  athleteOverview: (id: string) => get<AthleteOverview>(`/athletes/${encodeURIComponent(id)}/overview`),
  power: (id: string) => get<PowerView>(`/athletes/${encodeURIComponent(id)}/power`),
  zones: (id: string, weeks = 8) => get<ZonesView>(`/athletes/${encodeURIComponent(id)}/zones`, { weeks }),
  activity: (id: string, activityId: string) =>
    get<ActivityView>(`/athletes/${encodeURIComponent(id)}/activities/${encodeURIComponent(activityId)}`),
  calendar: (id: string, from: string, to: string) =>
    get<CalendarRange>(`/athletes/${encodeURIComponent(id)}/calendar`, { from, to }),
  assignWorkout: (body: { athleteIds: string[]; date: string; name: string; description: string; sport: Sport }) =>
    post<AssignResult>('/workouts', body),
  library: () => get<{ folders: LibraryFolder[] }>('/library'),
  savedWorkouts: () => get<{ workouts: SavedWorkout[] }>('/saved-workouts'),
  createSavedWorkout: (body: { name: string; sport: Sport; description: string }) => post<SavedWorkout>('/saved-workouts', body),
  updateSavedWorkout: (id: string, body: { name: string; sport: Sport; description: string }) =>
    put<SavedWorkout>(`/saved-workouts/${encodeURIComponent(id)}`, body),
  deleteSavedWorkout: (id: string) => del<{ ok: true }>(`/saved-workouts/${encodeURIComponent(id)}`),
  setSavedFavorite: (id: string, favorite: boolean) =>
    put<SavedWorkout>(`/saved-workouts/${encodeURIComponent(id)}`, { favorite }),
  markSavedUsed: (id: string, count: number) =>
    post<{ ok: true }>(`/saved-workouts/${encodeURIComponent(id)}/used`, { count }),
  plans: () => get<{ plans: TrainingPlan[] }>('/plans'),
  createPlan: (body: { name: string; workouts: PlanWorkout[] }) => post<TrainingPlan>('/plans', body),
  updatePlan: (id: string, body: { name: string; workouts: PlanWorkout[] }) => put<TrainingPlan>(`/plans/${encodeURIComponent(id)}`, body),
  deletePlan: (id: string) => del<{ ok: true }>(`/plans/${encodeURIComponent(id)}`),
  applyPlan: (id: string, body: { athleteIds: string[]; startDate: string }) => post<ApplyPlanResult>(`/plans/${encodeURIComponent(id)}/apply`, body),
  exchangeLoginCode: (code: string) => post<{ token: string }>('/public/auth/exchange', { code }),
  logout: () => post<{ ok: true }>('/auth/logout', {}),
  deleteAccount: () => del<{ ok: true }>('/me'),
  today: () => get<TodayView>('/me/today'),
  saveCheckin: (body: Checkin) => post<{ checkin: Checkin }>('/me/checkins', body),
  moveEvent: (athleteId: string, eventId: string, date: string) =>
    put<{ event: PlannedEvent }>(`/athletes/${encodeURIComponent(athleteId)}/events/${encodeURIComponent(eventId)}`, { date }),
  deleteEvent: (athleteId: string, eventId: string) =>
    del<{ ok: true }>(`/athletes/${encodeURIComponent(athleteId)}/events/${encodeURIComponent(eventId)}`),
  /** Mode démo : simule la fin d'une sortie et envoie la notification au coach. */
  simulateRide: () => post<{ notification: { title: string; body: string }; report: PushTestReport }>('/demo/simulate-ride', {}),
  createInvitation: () => post<{ code: string; expiresAt: string; url: string }>('/invitations', {}),

  // -------- Notifications push --------
  pushPublicKey: () => get<{ publicKey: string }>('/push/public-key'),
  /** `sub` = `PushSubscription.toJSON()` de l'appareil. */
  savePushSubscription: (sub: PushSubscriptionJSON) =>
    post<{ ok: true }>('/user/push/subscriptions', sub),
  deletePushSubscription: (endpoint: string) =>
    del<{ ok: true }>('/user/push/subscriptions', { endpoint }),
  sendTestPush: () => post<PushTestReport>('/user/push/test', {}),
};

