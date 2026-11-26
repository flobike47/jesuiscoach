import type { AxiosInstance } from 'axios';
import { createProviderClient } from './http.js';
import type { CalendarEventPatch, IntervalsActivity, IntervalsActivityDetail, IntervalsAthlete, IntervalsEvent, IntervalsFolder, IntervalsPowerCurves, IntervalsStream, IntervalsWellness, NewCalendarEvent, NewWorkoutEvent } from '../types.js';

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
        type: workout.sport ?? 'Ride',
        start_date_local: `${workout.date}T00:00:00`,
        name: workout.name,
        description: workout.description,
      })
    ).data;
  }

  /** Crée un événement quelconque : séance, compétition (RACE_A/B/C), note. Renvoie l'événement créé (id numérique). */
  async createEvent(id: string, ev: NewCalendarEvent): Promise<IntervalsEvent> {
    return (
      await this.http.post(`/athlete/${encodeURIComponent(id)}/events`, {
        category: ev.category,
        ...(ev.sport ? { type: ev.sport } : {}),
        start_date_local: `${ev.date}T00:00:00`,
        name: ev.name,
        ...(ev.description != null ? { description: ev.description } : {}),
      })
    ).data;
  }

  /** Modifie un événement (seuls les champs envoyés changent, vérifié au spike). */
  async updateEvent(id: string, eventId: string, patch: CalendarEventPatch): Promise<IntervalsEvent> {
    const body: Record<string, unknown> = {};
    if (patch.date) body.start_date_local = `${patch.date}T00:00:00`;
    if (patch.name != null) body.name = patch.name;
    if (patch.description != null) body.description = patch.description;
    if (patch.sport) body.type = patch.sport;
    if (patch.category) body.category = patch.category;
    return (await this.http.put(`/athlete/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, body)).data;
  }

  /** Déplace un événement du calendrier à une autre date (format attendu : AAAA-MM-JJT00:00:00). */
  async moveEvent(id: string, eventId: string, date: string): Promise<IntervalsEvent> {
    return (await this.http.put(`/athlete/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { start_date_local: `${date}T00:00:00` })).data;
  }

  async deleteEvent(id: string, eventId: string): Promise<void> {
    await this.http.delete(`/athlete/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`);
  }

  /** Détail d'une sortie avec ses intervalles. */
  async activity(activityId: string): Promise<IntervalsActivityDetail> {
    return (await this.http.get(`/activity/${encodeURIComponent(activityId)}`, { params: { intervals: true } })).data;
  }

  /** Streams d'une sortie (un point par seconde) ; les types absents sont omis. */
  async streams(activityId: string): Promise<IntervalsStream[]> {
    return (await this.http.get(`/activity/${encodeURIComponent(activityId)}/streams.json`, { params: { types: 'time,watts,heartrate' } })).data ?? [];
  }

  /**
   * Streams complets d'une sortie (un point par seconde enregistrée), pour les
   * calculs faits par l'app (phase D). Types absents omis par Intervals.icu.
   */
  async rawStreams(activityId: string): Promise<IntervalsStream[]> {
    return (
      (await this.http.get(`/activity/${encodeURIComponent(activityId)}/streams.json`, {
        params: { types: 'time,watts,heartrate,cadence,velocity_smooth,distance,altitude' },
      })).data ?? []
    );
  }

  /** Courbes de puissance vélo sur 90 jours et 1 an (records et modèles). */
  async powerCurves(id: string): Promise<IntervalsPowerCurves> {
    return (await this.http.get(`/athlete/${encodeURIComponent(id)}/power-curves.json`, { params: { type: 'Ride', curves: '90d,1y' } })).data;
  }

  /** Bibliothèque : dossiers et plans, avec leurs séances (lecture seule, scope LIBRARY:READ). */
  async folders(id: string): Promise<IntervalsFolder[]> {
    return (await this.http.get(`/athlete/${encodeURIComponent(id)}/folders`)).data ?? [];
  }

  /**
   * Réglages d'un sport (scope SETTINGS:WRITE). Corps partiel : seuls les
   * champs envoyés changent. `recalcHrZones` recalcule les zones cardio.
   */
  async updateSportSettings(
    id: string,
    sport: 'Ride' | 'Run' | 'Swim',
    patch: { ftp?: number; lthr?: number; max_hr?: number; threshold_pace?: number },
  ): Promise<void> {
    await this.http.put(`/athlete/${encodeURIComponent(id)}/sport-settings/${sport}`, patch, { params: { recalcHrZones: true } });
  }

  /** Profil de l'athlète (poids, FC repos, sexe, taille, naissance ; scope SETTINGS:WRITE). Un null efface le champ. */
  async updateAthleteProfile(
    id: string,
    patch: { icu_weight?: number | null; icu_resting_hr?: number | null; sex?: string | null; height?: number | null; icu_date_of_birth?: string | null },
  ): Promise<void> {
    await this.http.put(`/athlete/${encodeURIComponent(id)}`, patch);
  }

  /** Forme d'un jour (poids, FC repos ; scope WELLNESS:WRITE). `day` au format AAAA-MM-JJ. */
  async updateWellness(id: string, day: string, patch: { weight?: number; restingHR?: number }): Promise<void> {
    await this.http.put(`/athlete/${encodeURIComponent(id)}/wellness/${day}`, patch);
  }

  /** Révoque le jeton OAuth de l'app pour cet athlète (et coupe ses webhooks). */
  async disconnect(): Promise<void> {
    await this.http.delete('/disconnect-app');
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
