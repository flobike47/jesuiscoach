import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import { redis } from '../cache.js';
import { randomToken } from '../lib/crypto.js';
import { insertInvitation } from '../db/repo.js';
import { isoDay, summarize } from '../lib/summary.js';
import { enforceQuota } from '../ratelimit.js';
import { assertCanView, listCheckins, sourceFor, teamOf } from '../sources.js';
import type { AthleteSummary } from '../types.js';
import { BadRequest, HttpError, clampArray, validateString } from '../validation.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (now: Date, n: number) => isoDay(new Date(now.getTime() - n * DAY));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ATHLETE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

class Forbidden extends HttpError {
  constructor() { super(403, 'Réservé au coach'); }
}

interface AssignBody {
  athleteIds: string[];
  date: string;
  name: string;
  description: string;
}

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
          src.wellness(id, daysAgo(now, 14), isoDay(now)),
          src.activities(id, daysAgo(now, 28), isoDay(now)),
          src.events(id, daysAgo(now, 7), daysAgo(now, -7)),
        ]);
        return summarize(info, wellness, activities, events, now);
      }),
    );
    const athletes: AthleteSummary[] = [];
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
    const series = wellness
      .filter((w) => w.ctl != null)
      .map((w) => ({ date: w.id, fitness: w.ctl ?? 0, fatigue: w.atl ?? 0, form: Math.round(((w.ctl ?? 0) - (w.atl ?? 0)) * 10) / 10 }));
    const summary = summarize(info, wellness.slice(-14), activities, events, now);
    return { summary, series, activities, checkins };
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
        const planned = new Map(events.filter((e) => e.category === 'WORKOUT').map((e) => [e.start_date_local.slice(0, 10), e.name ?? 'Séance prévue']));
        return activities.map((a) => ({
          athleteId: id,
          athleteName: info.name ?? id,
          activity: a,
          plannedName: planned.get(a.start_date_local.slice(0, 10)) ?? null,
        }));
      }),
    );
    const items = rows.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    items.sort((a, b) => b.activity.start_date_local.localeCompare(a.activity.start_date_local));
    return { items: items.slice(0, 100) };
  });

  /** Calendrier d'un athlète entre deux dates (séances prévues + sorties faites). */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>('/athletes/:id/calendar', async (req) => {
    const me = requireUser(req);
    const id = req.params.id;
    if (!ATHLETE_ID_RE.test(id)) throw new BadRequest('id invalide');
    const { from, to } = req.query;
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw new BadRequest('from / to invalides (AAAA-MM-JJ)');
    if ((Date.parse(to) - Date.parse(from)) / DAY > 62) throw new BadRequest('Période limitée à 62 jours');
    await assertCanView(me, id);
    const src = await sourceFor(id);
    const [events, activities] = await Promise.all([src.events(id, from, to), src.activities(id, from, to)]);
    return { events, activities };
  });

  /** Déplace une séance prévue (l'athlète lui-même ou son coach). */
  app.put<{ Params: { id: string; eventId: string }; Body: { date?: string } }>('/athletes/:id/events/:eventId', async (req) => {
    const me = requireUser(req);
    const { id, eventId } = req.params;
    if (!ATHLETE_ID_RE.test(id) || !EVENT_ID_RE.test(eventId)) throw new BadRequest('id invalide');
    const date = req.body?.date;
    if (typeof date !== 'string' || !DATE_RE.test(date)) throw new BadRequest('date invalide (AAAA-MM-JJ)');
    await assertCanView(me, id);
    await enforceQuota(me.id, 'editCalendar');
    const event = await (await sourceFor(id)).moveEvent(id, eventId, date);
    await invalidateEvents(id);
    return { event };
  });

  /** Supprime une séance prévue (l'athlète lui-même ou son coach). */
  app.delete<{ Params: { id: string; eventId: string } }>('/athletes/:id/events/:eventId', async (req) => {
    const me = requireUser(req);
    const { id, eventId } = req.params;
    if (!ATHLETE_ID_RE.test(id) || !EVENT_ID_RE.test(eventId)) throw new BadRequest('id invalide');
    await assertCanView(me, id);
    await enforceQuota(me.id, 'editCalendar');
    await (await sourceFor(id)).deleteEvent(id, eventId);
    await invalidateEvents(id);
    return { ok: true };
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

  /** Envoi d'une séance au calendrier Intervals.icu de plusieurs athlètes. */
  app.post<{ Body: AssignBody }>('/workouts', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const body = req.body ?? ({} as AssignBody);
    if (!Array.isArray(body.athleteIds) || body.athleteIds.length === 0) throw new BadRequest('athleteIds requis');
    if (typeof body.date !== 'string' || !DATE_RE.test(body.date)) throw new BadRequest('date invalide (AAAA-MM-JJ)');
    const workout = {
      date: body.date,
      name: validateString(body.name, 'name', 120),
      description: validateString(body.description, 'description', 4000),
    };
    const team = new Set(await teamOf(me));
    const targets = clampArray(body.athleteIds, 50).filter((id): id is string => typeof id === 'string' && team.has(id));
    if (targets.length === 0) throw new BadRequest('Aucun athlète de ton équipe dans la sélection');
    await enforceQuota(me.id, 'assignWorkout');

    const results = await Promise.all(
      targets.map(async (id) => {
        try {
          await (await sourceFor(id)).createWorkout(id, workout);
          await invalidateEvents(id);
          return { id, ok: true as const };
        } catch (e) {
          req.log.warn({ err: e, athleteId: id }, 'workouts: envoi en échec');
          return { id, ok: false as const, error: e instanceof HttpError ? e.message : "Envoi à Intervals.icu impossible" };
        }
      }),
    );
    return { results };
  });
}

/** Le calendrier vient de changer : on jette les plages d'événements en cache. */
async function invalidateEvents(athleteId: string) {
  try {
    const keys = await redis.keys(`icu:events:${athleteId}:*`);
    if (keys.length) await redis.del(...keys);
  } catch {
    /* Redis down : le TTL de 10 min fera le travail */
  }
}
