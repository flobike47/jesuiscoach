import type { AxiosInstance } from 'axios';
import { createProviderClient, ProviderError } from '../providers/http.js';
import type { WahooPlanJson } from './wahooPlan.js';

/**
 * Client Wahoo Cloud (https://api.wahooligan.com), documentation officielle.
 *  - Accès soumis à validation par Wahoo. Limites : app sandbox 25 req / 5 min,
 *    100 / h, 250 / jour ; app production 200 / 5 min, 1 000 / h, 5 000 / jour.
 *  - OAuth 2 + PKCE (S256). Jeton d'accès valable 2 h. Le rafraîchissement renvoie
 *    un NOUVEAU refresh_token et révoque l'ancien : le service doit enregistrer le
 *    nouveau couple avant tout autre appel (voir devices/service.ts).
 *  - Aucun appel réel en test : les tests injectent un client simulé.
 */

export const WAHOO_BASE = 'https://api.wahooligan.com';
/** Scopes demandés : user_read obligatoire ; offline_data pour les webhooks. */
export const WAHOO_SCOPES = 'user_read workouts_read workouts_write plans_write offline_data';

/** Valeurs de `workout_type_id` pour la séance planifiée (à confirmer à l'activation). */
export const WAHOO_WORKOUT_TYPE_ID = { Ride: 0, Run: 1 } as const;

export interface WahooTokens {
  accessToken: string;
  refreshToken: string;
  /** Instant d'expiration du jeton d'accès. */
  expiresAt: Date;
  scope: string;
}

export interface WahooCredentials {
  clientId: string;
  clientSecret: string;
}

export function authorizeUrl(c: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL('/oauth/authorize', WAHOO_BASE);
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    scope: WAHOO_SCOPES,
    response_type: 'code',
    state: c.state,
    code_challenge: c.challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.href;
}

function tokensOf(data: unknown, now: Date): WahooTokens {
  const d = data as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown } | null;
  if (!d || typeof d.access_token !== 'string' || typeof d.refresh_token !== 'string' || typeof d.expires_in !== 'number') {
    throw new ProviderError('Réponse Wahoo inattendue', 502, 'Wahoo');
  }
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: new Date(now.getTime() + d.expires_in * 1000),
    scope: typeof d.scope === 'string' ? d.scope : '',
  };
}

export class WahooClient {
  constructor(
    private readonly creds: WahooCredentials,
    private readonly http: AxiosInstance = createProviderClient(WAHOO_BASE, 'Wahoo'),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async exchangeCode(code: string, verifier: string, redirectUri: string): Promise<WahooTokens> {
    const { data } = await this.http.post('/oauth/token', new URLSearchParams({
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return tokensOf(data, this.now());
  }

  async refresh(refreshToken: string): Promise<WahooTokens> {
    const { data } = await this.http.post('/oauth/token', new URLSearchParams({
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return tokensOf(data, this.now());
  }

  /** Identifiant Wahoo de l'utilisateur (`id`, reçu dans les webhooks). */
  async userId(accessToken: string): Promise<string> {
    const { data } = await this.http.get('/v1/user', auth(accessToken));
    const id = (data as { id?: unknown } | null)?.id;
    if (id == null || (typeof id !== 'number' && typeof id !== 'string')) throw new ProviderError('Réponse Wahoo inattendue', 502, 'Wahoo');
    return String(id);
  }

  /** Révoque l'autorisation de l'app. */
  async revoke(accessToken: string): Promise<void> {
    await this.http.delete('/v1/permissions', auth(accessToken));
  }

  /** Crée un plan (séance structurée) ; renvoie son identifiant. */
  async createPlan(accessToken: string, plan: PlanPayload): Promise<string> {
    const { data } = await this.http.post('/v1/plans', { plan: planBody(plan) }, auth(accessToken));
    return idOf(data);
  }

  async updatePlan(accessToken: string, planId: string, plan: PlanPayload): Promise<void> {
    await this.http.put(`/v1/plans/${encodeURIComponent(planId)}`, { plan: planBody(plan) }, auth(accessToken));
  }

  async deletePlan(accessToken: string, planId: string): Promise<void> {
    await this.http.delete(`/v1/plans/${encodeURIComponent(planId)}`, auth(accessToken));
  }

  /** Planifie une séance à une date (le compteur l'affiche à partir de J, jusqu'à J+6). */
  async createWorkout(accessToken: string, w: WorkoutPayload): Promise<string> {
    const { data } = await this.http.post(
      '/v1/workouts',
      {
        workout: {
          name: w.name,
          workout_token: w.workoutToken,
          workout_type_id: w.workoutTypeId,
          starts: w.starts,
          minutes: w.minutes,
          plan_id: Number(w.planId),
        },
      },
      auth(accessToken),
    );
    return idOf(data);
  }
}

export interface PlanPayload {
  plan: WahooPlanJson;
  filename: string;
  externalId: string;
  providedUpdatedAt: string;
}

export interface WorkoutPayload {
  name: string;
  workoutToken: string;
  workoutTypeId: number;
  /** ISO 8601, ex. 2026-12-02T07:00:00.000Z. */
  starts: string;
  minutes: number;
  planId: string;
}

const auth = (accessToken: string) => ({ headers: { Authorization: `Bearer ${accessToken}` } });

/** plan.json encodé en data URI base64, comme attendu par l'API. */
function planBody(p: PlanPayload) {
  const file = `data:application/json;base64,${Buffer.from(JSON.stringify(p.plan)).toString('base64')}`;
  return { file, filename: p.filename, external_id: p.externalId, provider_updated_at: p.providedUpdatedAt };
}

function idOf(data: unknown): string {
  const id = (data as { id?: unknown } | null)?.id;
  if (id == null || (typeof id !== 'number' && typeof id !== 'string')) throw new ProviderError('Réponse Wahoo inattendue', 502, 'Wahoo');
  return String(id);
}
