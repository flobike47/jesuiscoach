import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { rideNotification } from '../jobs/sync.js';
import { pushConfigured, PushUnavailable, sendToUser } from '../push.js';
import { enforceQuota } from '../ratelimit.js';
import { demoSource } from '../sources.js';
import { NotFound } from '../validation.js';

/**
 * Outils du mode démo uniquement (404 sinon) : simuler une sortie pour
 * tester de bout en bout la notification envoyée au coach.
 */
export async function registerDemoRoutes(app: FastifyInstance) {
  app.post('/demo/simulate-ride', async (req) => {
    if (!config.demoMode) throw new NotFound();
    const me = requireUser(req);
    if (me.role !== 'coach') throw new NotFound();
    if (!pushConfigured) throw new PushUnavailable();
    await enforceQuota(me.id, 'pushTest');

    const demo = demoSource();
    const ids = demo.athleteIds().filter((id) => id !== me.athleteId);
    const athleteId = ids[Math.floor(Math.random() * ids.length)];
    const { name, activity } = demo.simulateRide(athleteId);
    // Même contenu que la vraie synchro (jobs/sync.ts), envoyé au coach démo.
    const payload = rideNotification(name, athleteId, activity);
    const report = await sendToUser(me.id, payload, req.log);
    return { notification: payload, report };
  });
}
