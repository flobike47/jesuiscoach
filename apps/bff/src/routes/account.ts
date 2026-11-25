import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { handleWebhookEvents, parseEvents } from '../jobs/webhook.js';
import { deleteAccount } from '../sources.js';
import { Conflict, NotFound, Unauthorized } from '../validation.js';

/** Comparaison en temps constant (empreintes de même longueur). */
function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/** Secret fourni par Intervals.icu : dans le corps (`secret`), ou en en-tête Authorization (« Webhook Authorization Header »). */
function providedSecret(body: unknown, authorization: string | undefined): string | null {
  const inBody = (body as { secret?: unknown } | null)?.secret;
  if (typeof inBody === 'string' && inBody) return inBody;
  if (authorization) return authorization.replace(/^Bearer\s+/i, '');
  return null;
}

export async function registerAccountRoutes(app: FastifyInstance) {
  /**
   * Webhooks Intervals.icu (route publique, gardée par le secret de l'app).
   * Répond tout de suite : Intervals.icu renvoie l'événement tant qu'il
   * n'a pas reçu de 2xx, la synchro part en différé.
   */
  app.post('/public/webhooks/intervals', async (req) => {
    const expected = config.intervalsWebhookSecret;
    if (!expected || config.demoMode) throw new NotFound('Not found');
    const provided = providedSecret(req.body, req.headers.authorization);
    if (!provided || !sameSecret(provided, expected)) throw new Unauthorized('Secret de webhook invalide');
    const events = parseEvents(req.body);
    await handleWebhookEvents(events, { log: req.log });
    return { ok: true, events: events.length };
  });

  /** Suppression définitive du compte connecté (droit à l'effacement). */
  app.delete('/me', async (req) => {
    const me = requireUser(req);
    if (config.demoMode) throw new Conflict('Les comptes de démo ne se suppriment pas');
    await deleteAccount(me, (err) => req.log.warn({ err, userId: me.id }, 'compte: révocation Intervals.icu échouée'));
    req.log.info({ userId: me.id }, 'compte supprimé');
    return { ok: true };
  });
}
