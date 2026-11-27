import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { isoDay } from '../lib/summary.js';
import { weightSeries } from '../lib/weight.js';
import { saveWeightSharing, weightSharing } from '../sharingStore.js';
import { assertCanView, sourceFor } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, Forbidden } from '../validation.js';

/**
 * Évolution du poids (donnée de santé). L'athlète voit toujours sa courbe ;
 * son coach seulement si l'athlète l'a autorisé (désactivé par défaut,
 * révocable). L'accord est vérifié ici, à chaque requête, avant toute lecture
 * chez Intervals.icu : masquer la courbe côté web ne suffirait pas.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Un an de pesées : une lecture Intervals.icu, gardée 6 h en cache (TTL.wellnessHistory). */
const HISTORY_DAYS = 365;

export async function registerWeightRoutes(app: FastifyInstance) {
  /** Choix de partage de l'athlète connecté (sa propre décision uniquement). */
  app.get('/me/sharing', async (req) => {
    const me = requireUser(req);
    const since = await weightSharing(me.athleteId);
    return { weightToCoach: since != null, weightSince: since };
  });

  app.put<{ Body: unknown }>('/me/sharing', async (req) => {
    const me = requireUser(req);
    const body = req.body as { weightToCoach?: unknown } | null;
    if (!body || typeof body !== 'object' || typeof body.weightToCoach !== 'boolean') {
      throw new BadRequest('weightToCoach attendu (true ou false)');
    }
    const since = await saveWeightSharing(me, body.weightToCoach);
    req.log.info({ weightToCoach: since != null }, 'partage du poids modifié');
    return { weightToCoach: since != null, weightSince: since };
  });

  /** Courbe du poids sur un an. 404 hors équipe, 403 pour le coach sans accord de l'athlète. */
  app.get<{ Params: { id: string } }>('/athletes/:id/weight', async (req) => {
    const me = requireUser(req);
    const id = req.params.id;
    if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
    await assertCanView(me, id);
    const self = me.athleteId === id;
    if (!self && (await weightSharing(id)) == null) {
      throw new Forbidden("Cet athlète ne partage pas l'évolution de son poids");
    }
    const now = new Date();
    const src = await sourceFor(id);
    const wellness = await src.wellnessHistory(id, isoDay(new Date(now.getTime() - HISTORY_DAYS * DAY)), isoDay(now));
    return { points: weightSeries(wellness), days: HISTORY_DAYS };
  });
}
