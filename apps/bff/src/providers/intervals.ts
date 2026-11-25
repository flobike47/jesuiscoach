import type { AxiosInstance } from 'axios';
import { createProviderClient } from './http.js';
import type { IntervalsActivity, IntervalsAthlete, IntervalsEvent, IntervalsWellness, NewWorkoutEvent } from '../types.js';

/**
 * Client Intervals.icu (https://intervals.icu/api/v1).
 *  - OAuth : `Authorization: Bearer <access_token>` (pas de refresh token ;
 *    un 401 impose de refaire la connexion).
 *  - Clé API perso (dev, en attendant la validation de l'app OAuth) :
 *    Basic `API_KEY:<clé>`.
 * Quotas : 100 requêtes/utilisateur/jour en OAuth, 10 appels/s par IP →
 * toujours passer par le cache (cache.ts) plutôt qu'appeler en direct.
 */

export const INTERVALS_BASE = 'https://intervals.icu';
// Cloudflare (devant Intervals.icu) bloque certains user-agents par défaut.
const USER_AGENT = 'jesuiscoach/0.1 (+https://github.com/flobike47/jesuiscoach)';

export type IntervalsAuth = { kind: 'oauth'; accessToken: string } | { kind: 'apiKey'; apiKey: string };

export function authHeader(auth: IntervalsAuth): string {
  return auth.kind === 'oauth'
    ? `Bearer ${auth.accessToken}`
    : `Basic ${Buffer.from(`API_KEY:${auth.apiKey}`).toString('base64')}`;
}

export class IntervalsClient {
  private http: AxiosInstance;

  constructor(auth: IntervalsAuth, http = createProviderClient(`${INTERVALS_BASE}/api/v1`, 'Intervals.icu')) {
    this.http = http;
    this.http.defaults.headers.common.Authorization = authHeader(auth);
    this.http.defaults.headers.common['User-Agent'] = USER_AGENT;
  }

  async athlete(id: string): Promise<IntervalsAthlete> {
    return (await this.http.get(`/athlete/${encodeURIComponent(id)}`)).data;
  }

  async wellness(id: string, oldest: string, newest: string): Promise<IntervalsWellness[]> {
    return (await this.http.get(`/athlete/${encodeURIComponent(id)}/wellness`, { params: { oldest, newest } })).data ?? [];
  }

  async activities(id: string, oldest: string, newest: string): Promise<IntervalsActivity[]> {
    return usableActivities((await this.http.get(`/athlete/${encodeURIComponent(id)}/activities`, { params: { oldest, newest } })).data ?? []);
  }

  async events(id: string, oldest: string, newest: string): Promise<IntervalsEvent[]> {
    return (await this.http.get(`/athlete/${encodeURIComponent(id)}/events`, { params: { oldest, newest } })).data ?? [];
  }

  async createWorkout(id: string, workout: NewWorkoutEvent): Promise<IntervalsEvent> {
    return (
      await this.http.post(`/athlete/${encodeURIComponent(id)}/events`, {
        category: 'WORKOUT',
        type: 'Ride',
        start_date_local: `${workout.date}T00:00:00`,
        name: workout.name,
        description: workout.description,
      })
    ).data;
  }

  /** Déplace un événement du calendrier à une autre date (format attendu : AAAA-MM-JJT00:00:00). */
  async moveEvent(id: string, eventId: string, date: string): Promise<IntervalsEvent> {
    return (await this.http.put(`/athlete/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { start_date_local: `${date}T00:00:00` })).data;
  }

  async deleteEvent(id: string, eventId: string): Promise<void> {
    await this.http.delete(`/athlete/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`);
  }
}

/**
 * Retire les sorties que l'API ne détaille pas. Les sorties importées depuis
 * Strava ne reviennent que sous forme de coquille ({ id, start_date_local,
 * source: 'STRAVA', _note: 'STRAVA activities are not available via the API' }) :
 * sans type ni mesures, elles produiraient des notifications et des lignes
 * vides. Constaté au spike du 25/11/2026 (10 sorties sur 120 en un an).
 */
export function usableActivities(list: IntervalsActivity[]): IntervalsActivity[] {
  return list.filter((a) => Boolean(a.type) && a.source !== 'STRAVA');
}

/** Échange du code OAuth (à faire dans les 2 minutes qui suivent la redirection). */
export async function exchangeCode(
  params: { clientId: string; clientSecret: string; code: string; codeVerifier: string; redirectUri: string },
  http = createProviderClient(INTERVALS_BASE, 'Intervals.icu OAuth'),
): Promise<{ accessToken: string; scope: string; athleteId: string; athleteName?: string }> {
  const form = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  const { data } = await http.post('/api/oauth/token', form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
  });
  if (!data?.access_token || !data?.athlete?.id) throw new Error('Réponse OAuth Intervals.icu incomplète');
  return {
    accessToken: data.access_token,
    scope: data.scope ?? '',
    athleteId: String(data.athlete.id),
    athleteName: data.athlete.name,
  };
}
