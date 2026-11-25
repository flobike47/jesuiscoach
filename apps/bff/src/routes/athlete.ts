import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { isoDay, summarize } from '../lib/summary.js';
import { listCheckins, saveCheckin, sourceFor } from '../sources.js';
import { BadRequest } from '../validation.js';

/**
 * Parcours de l'athlète connecté (« Aujourd'hui ») : ses propres données
 * uniquement — l'identité vient de la session, jamais d'un paramètre.
 */

const DAY = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Lundi de la semaine de `d` (UTC). */
function mondayOf(d: Date): Date {
  const offset = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset));
}

interface CheckinBody {
  day?: string;
  feeling?: number;
  rpe?: number | null;
  note?: string | null;
}

export async function registerAthleteRoutes(app: FastifyInstance) {
  app.get('/me/today', async (req) => {
    const me = requireUser(req);
    const id = me.athleteId;
    const now = new Date();
    const today = isoDay(now);
    const monday = mondayOf(now);
    const sunday = new Date(monday.getTime() + 6 * DAY);
    const src = await sourceFor(id);
    const [info, wellness, activities, events, checkins] = await Promise.all([
      src.athlete(id),
      src.wellness(id, isoDay(new Date(now.getTime() - 14 * DAY)), today),
      src.activities(id, isoDay(monday), isoDay(sunday)),
      src.events(id, isoDay(monday), isoDay(sunday)),
      listCheckins(id, today, today),
    ]);
    const workouts = events.filter((e) => e.category === 'WORKOUT');
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = isoDay(new Date(monday.getTime() + i * DAY));
      const dayActivities = activities.filter((a) => a.start_date_local.startsWith(date));
      return {
        date,
        planned: workouts.filter((e) => e.start_date_local.startsWith(date)).map((e) => e.name ?? 'Séance'),
        load: dayActivities.reduce((s, a) => s + (a.icu_training_load ?? 0), 0),
        done: dayActivities.length > 0,
      };
    });
    const summary = summarize(info, wellness, activities, events, now);
    return {
      today,
      name: me.name,
      workouts: workouts.filter((e) => e.start_date_local.startsWith(today)),
      activitiesToday: activities.filter((a) => a.start_date_local.startsWith(today)),
      week,
      form: { fitness: summary.fitness, fatigue: summary.fatigue, form: summary.form },
      checkin: checkins[0] ?? null,
    };
  });

  app.post<{ Body: CheckinBody }>('/me/checkins', async (req) => {
    const me = requireUser(req);
    const body = req.body ?? {};
    // Jour local de l'athlète : accepté à ± 1 jour du jour serveur (fuseaux).
    const day = body.day;
    if (typeof day !== 'string' || !DATE_RE.test(day) || Math.abs(Date.parse(day) - Date.parse(isoDay(new Date()))) > DAY) {
      throw new BadRequest('day invalide (aujourd’hui, AAAA-MM-JJ)');
    }
    const feeling = body.feeling;
    if (!Number.isInteger(feeling) || (feeling as number) < 1 || (feeling as number) > 5) throw new BadRequest('feeling entre 1 et 5');
    const rpe = body.rpe ?? null;
    if (rpe !== null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) throw new BadRequest('rpe entre 1 et 10');
    const note = body.note == null ? null : String(body.note).trim().slice(0, 500) || null;
    const checkin = { day, feeling: feeling as number, rpe, note };
    await saveCheckin(me, checkin);
    return { checkin };
  });
}
