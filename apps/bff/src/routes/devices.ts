import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { findUserByAthlete } from '../db/repo.js';
import { connectWahoo, deviceStatus, disconnectWahoo, finishWahoo, receiveWahooSummary, wahooConfigured, type WahooSummary } from '../devices/service.js';
import { userOfExternal } from '../db/deviceRepo.js';
import { assertCanView } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, HttpError, NotFound, Unauthorized } from '../validation.js';

/**
 * Appareils reliés directement à l'app (phase E) : connexion Wahoo, état des
 * appareils par athlète, réception des sorties (webhook). Logique dans
 * devices/service.ts ; ici seulement les entrées, les contrôles d'accès et les redirections.
 */

const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_CODE = 512;

/** Comparaison en temps constant (empreintes de même longueur). */
function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/** Retour vers le web. Le résultat passe dans le fragment (#), jamais dans la requête. */
function back(reply: FastifyReply, params: Record<string, string>) {
  return reply.redirect(`${new URL('profil/appareils', config.appUrl).href}#${new URLSearchParams(params).toString()}`);
}

export async function registerDeviceRoutes(app: FastifyInstance) {
  /** Démarre la connexion Wahoo : renvoie l'URL d'autorisation (state + PKCE dans Redis, 10 min). */
  app.post('/devices/wahoo/connect', async (req) => {
    // Toujours le compte connecté : seul l'athlète relie ses propres appareils.
    const me = requireUser(req);
    return { url: await connectWahoo(me.id) };
  });

  /** Retour de Wahoo (route publique, protégée par le state à usage unique). */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/public/devices/wahoo/callback', async (req, reply) => {
    if (!wahooConfigured()) throw new HttpError(503, 'Connexion Wahoo non configurée sur ce serveur');
    const { code, state, error } = req.query;
    if (error) return back(reply, { erreur: 'refus' });
    if (!code || !state || !STATE_RE.test(state) || code.length > MAX_CODE) return back(reply, { erreur: 'requete_invalide' });
    const result = await finishWahoo(state, code);
    return result === 'ok' ? back(reply, { wahoo: 'ok' }) : back(reply, { erreur: result });
  });

  /** Déconnexion de Wahoo (révocation au mieux, suppression locale). */
  app.delete('/devices/wahoo', async (req) => {
    const me = requireUser(req);
    await disconnectWahoo(me.id);
    return { ok: true };
  });

  /** État des appareils d'un athlète : lui-même ou son coach. Hors équipe : 404. */
  app.get<{ Params: { id: string } }>('/athletes/:id/devices', async (req) => {
    const me = requireUser(req);
    const id = req.params.id;
    if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
    await assertCanView(me, id);
    const user = config.demoMode ? null : await findUserByAthlete(id);
    return deviceStatus(user?.id ?? null);
  });

  /**
   * Webhook Wahoo (route publique) : `webhook_token` du corps comparé au secret
   * de l'app. Sans secret configuré, la route répond 404. Un événement qui n'est
   * pas un résumé de sortie, ou d'un compte non relié, reçoit 200 (pas de nouvelle tentative).
   */
  app.post('/public/webhooks/wahoo', async (req) => {
    const expected = config.wahooWebhookToken;
    if (!expected || config.demoMode) throw new NotFound('Not found');
    const body = (req.body ?? {}) as {
      event_type?: unknown;
      webhook_token?: unknown;
      user?: { id?: unknown } | null;
      workout_summary?: WahooSummary | null;
    };
    const provided = typeof body.webhook_token === 'string' ? body.webhook_token : '';
    if (!provided || !sameSecret(provided, expected)) throw new Unauthorized('Jeton de webhook invalide');
    if (body.event_type !== 'workout_summary') return { ok: true, ignored: true };

    const externalId = typeof body.user?.id === 'string' || typeof body.user?.id === 'number' ? String(body.user.id) : null;
    const userId = externalId ? await userOfExternal('wahoo', externalId) : null;
    if (!userId) return { ok: true, ignored: true };

    const result = await receiveWahooSummary(userId, body.workout_summary ?? {}, req.log);
    return { ok: true, result };
  });
}
