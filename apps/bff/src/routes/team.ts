import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { randomToken } from '../lib/crypto.js';
import { insertInvitation } from '../db/repo.js';
import { appFitness, storeOf, withAppLoad } from '../activityStore.js';
import { fitnessPoints } from '../lib/fitness.js';
import { matchPlan } from '../lib/plan.js';
import { isoDay, summarize } from '../lib/summary.js';
import { assertCanView, listCheckins, sourceFor, teamOf } from '../sources.js';
import type { AthleteSummary } from '../types.js';
import { ATHLETE_ID_RE, BadRequest, Forbidden, HttpError } from '../validation.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (now: Date, n: number) => isoDay(new Date(now.getTime() - n * DAY));


export async function registerTeamRoutes(app: FastifyInstance) {
  /** Profil courant : rôle, nom, mode démo. */
  app.get('/me', async (req) => {
    const me = requireUser(req);
    return { role: me.role, name: me.name, athleteId: me.athleteId, demo: config.demoMode };
  });

  /** État public : le web adapte l'écran de connexion (démo, Intervals configuré). */
  app.get('/public/status', async () => ({
    demo: config.demoMode,
    intervals: Boolean(config.intervalsClientId && config.intervalsClientSecret && config.tokenEncryptionKey),
  }));

  /** Tableau « Équipe » du coach. Un athlète en erreur ne bloque pas les autres. */
  app.get('/team', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const now = new Date();
    const ids = await teamOf(me);
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const src = await sourceFor(id);
        const [info, wellness, activities, events] = await Promise.all([
          src.athlete(id),
          // 90 jours : la forme calculée par l'app part de la wellness de J−90.
          src.wellness(id, daysAgo(now, 90), isoDay(now)),
          src.activities(id, daysAgo(now, 28), isoDay(now)),
          src.events(id, daysAgo(now, 7), daysAgo(now, -7)),
        ]);
        const store = await storeOf(id, src, now);
        const app = store ? await appFitness(store, daysAgo(now, 90), isoDay(now), wellness) : null;
        return { ...summarize(info, app?.wellness ?? wellness, activities, events, now), source: app ? ('app' as const) : ('intervals' as const) };
      }),
    );
    const athletes: Array<AthleteSummary & { source: 'app' | 'intervals' }> = [];
    const errors: Array<{ id: string; error: string }> = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') athletes.push(r.value);
      else {
        req.log.warn({ err: r.reason, athleteId: ids[i] }, 'team: athlète en erreur');
        errors.push({ id: ids[i], error: r.reason instanceof HttpError ? r.reason.message : 'Données indisponibles' });
      }
    });
    return { athletes, errors };
  });

  /** Fiche athlète : courbe fitness/fatigue/forme sur 90 jours + sorties des 30 derniers jours. */
  app.get<{ Params: { id: string } }>('/athletes/:id/overview', async (req) => {
    const me = requireUser(req);
    const id = req.params.id;
    if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
    await assertCanView(me, id);
    const now = new Date();
    const src = await sourceFor(id);
    const [info, wellness, activities, events, checkins] = await Promise.all([
      src.athlete(id),
      src.wellness(id, daysAgo(now, 90), isoDay(now)),
      src.activities(id, daysAgo(now, 30), isoDay(now)),
      src.events(id, daysAgo(now, 7), daysAgo(now, -7)),
      listCheckins(id, daysAgo(now, 14), isoDay(now)),
    ]);
    // Fitness, fatigue et forme calculées par l'app quand ses sorties sont en base ; sinon Intervals.icu.
    const store = await storeOf(id, src, now);
    const app = store ? await appFitness(store, daysAgo(now, 90), isoDay(now), wellness) : null;
    const series = fitnessPoints(app?.days ?? null, wellness);
    const shown = await withAppLoad(store, activities, daysAgo(now, 30), isoDay(now));
    const summary = summarize(info, (app?.wellness ?? wellness).slice(-14), shown, events, now);
    return { summary, series, activities: shown, checkins, source: app ? 'app' : 'intervals' };
  });

  /** Fil d'activité : sorties de toute l'équipe sur 7 jours, la plus récente d'abord. */
  app.get('/feed', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const now = new Date();
    const ids = await teamOf(me);
    const rows = await Promise.allSettled(
      ids.map(async (id) => {
        const src = await sourceFor(id);
        const [info, activities, events] = await Promise.all([
          src.athlete(id),
          src.activities(id, daysAgo(now, 7), isoDay(now)),
          src.events(id, daysAgo(now, 7), isoDay(now)),
        ]);
        const { eventOfActivity } = matchPlan(events, activities);
        // Charge calculée par l'app quand elle existe (remplace icu_training_load, comme ailleurs).
        const store = await storeOf(id, src, now);
        const shown = await withAppLoad(store, activities, daysAgo(now, 7), isoDay(now));
        return shown.map((activity) => {
          const planned = eventOfActivity.get(String(activity.id));
          return { athleteId: id, athleteName: info.name ?? id, activity, plannedName: planned ? (planned.name ?? 'Séance prévue') : null };
        });
      }),
    );
    const items = rows.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    items.sort((a, b) => b.activity.start_date_local.localeCompare(a.activity.start_date_local));
    return { items: items.slice(0, 100) };
  });

  /** Invitation à rejoindre l'équipe : lien valable 7 jours, à usage unique. */
  app.post('/invitations', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    if (config.demoMode) throw new BadRequest('Invitations indisponibles en mode démo');
    const code = randomToken(18);
    const expiresAt = new Date(Date.now() + 7 * DAY);
    await insertInvitation(code, me.id, expiresAt);
    return { code, expiresAt: expiresAt.toISOString(), url: `${config.appUrl}connexion?invitation=${code}` };
  });


}
