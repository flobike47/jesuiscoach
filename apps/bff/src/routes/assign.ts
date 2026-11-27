import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { appFitness, storeOf, withAppLoad } from '../activityStore.js';
import { readCalendar } from '../calendarService.js';
import { careStoreFor } from '../careStore.js';
import { suggest, type AssignAthlete, type AssignDay, type Suggestion } from '../lib/assign.js';
import { availabilityOf, checkWorkout } from '../lib/care.js';
import { isoDay } from '../lib/summary.js';
import { estimatedIntensity, estimatedLoad, estimatedSeconds, parseWorkoutText, type WorkoutSport } from '../lib/workoutText.js';
import { sourceFor, teamOf } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, Forbidden } from '../validation.js';

const DAY = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SPORTS: WorkoutSport[] = ['Ride', 'Run', 'Swim'];
/** Fenêtre de placement maximale (jours). */
const MAX_WINDOW = 14;
const MAX_ATHLETES = 50;

interface SuggestBody {
  description?: unknown;
  sport?: unknown;
  athleteIds?: unknown;
  from?: unknown;
  to?: unknown;
}

const shift = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY));

function validate(body: SuggestBody | undefined) {
  const { description, sport, athleteIds, from, to } = body ?? {};
  if (typeof description !== 'string' || description.length === 0 || description.length > 4000) throw new BadRequest('description invalide');
  if (typeof sport !== 'string' || !SPORTS.includes(sport as WorkoutSport)) throw new BadRequest('sport invalide');
  if (!Array.isArray(athleteIds) || athleteIds.length === 0 || athleteIds.length > MAX_ATHLETES || !athleteIds.every((id) => typeof id === 'string' && ATHLETE_ID_RE.test(id))) {
    throw new BadRequest('athleteIds invalides');
  }
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw new BadRequest('from / to invalides (AAAA-MM-JJ)');
  if ((Date.parse(to) - Date.parse(from)) / DAY > MAX_WINDOW) throw new BadRequest(`Fenêtre limitée à ${MAX_WINDOW} jours`);
  return { description, sport: sport as WorkoutSport, athleteIds: [...new Set(athleteIds as string[])], from, to };
}

/**
 * Données d'un athlète pour le moteur. Mêmes lectures (et donc même cache)
 * que /team et le calendrier : aucune requête Intervals.icu de plus quand
 * l'écran Équipe ou le calendrier viennent d'être ouverts.
 */
async function athleteInput(id: string, from: string, to: string, sport: WorkoutSport, highIntensity: boolean, seconds: number): Promise<AssignAthlete> {
  const now = new Date();
  const today = isoDay(now);
  const ctxFrom = shift(from, -2);
  const ctxTo = shift(to, 1);
  const src = await sourceFor(id);
  const [info, wellness, cal, care] = await Promise.all([
    src.athlete(id),
    src.wellness(id, isoDay(new Date(now.getTime() - 90 * DAY)), today),
    readCalendar(id, ctxFrom, ctxTo),
    careStoreFor(id).then(({ store, name }) => store.read().then((state) => ({ state, name }))),
  ]);
  const store = await storeOf(id, src, now);
  const app = store ? await appFitness(store, isoDay(new Date(now.getTime() - 90 * DAY)), today, wellness) : null;
  const lastFit = app?.days.at(-1);
  const lastIcu = [...wellness].reverse().find((w) => w.ctl != null && w.atl != null);
  const form = lastFit ? lastFit.form : lastIcu ? (lastIcu.ctl ?? 0) - (lastIcu.atl ?? 0) : null;

  const recent = (app?.wellness ?? wellness).slice(-8);
  const hrv = recent.map((w) => w.hrv).filter((v): v is number => typeof v === 'number' && v > 0);
  const lastSleep = [...recent].reverse().find((w) => typeof w.sleepSecs === 'number')?.sleepSecs ?? null;

  const past = store ? await store.backend.list(shift(today, -28), shift(today, -1)) : [];
  const usualWeekLoad = past.length ? past.reduce((s, r) => s + (r.load ?? 0), 0) / 4 : null;
  const lastRide = past.map((r) => r.startLocal.slice(0, 10)).sort().at(-1);
  const daysSinceRide = lastRide ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lastRide}T12:00:00Z`)) / DAY) : null;

  const activities = await withAppLoad(store, cal.activities, ctxFrom, ctxTo);
  const days: AssignDay[] = [];
  for (let day = ctxFrom; day <= ctxTo; day = shift(day, 1)) {
    const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
    const existing = cal.events
      .filter((e) => e.category === 'WORKOUT' && e.start_date_local.slice(0, 10) === day)
      .map((e) => {
        const { blocks } = parseWorkoutText(e.description ?? '');
        return { id: String(e.id), name: e.name ?? 'Séance', load: estimatedLoad(blocks), intensity: estimatedIntensity(blocks) };
      });
    const blocked = checkWorkout({ date: day, sport, durationSec: seconds, usesPower: sport === 'Ride', highIntensity }, care).find(
      (w) => w.level === 'block' && w.kind === 'injury',
    );
    days.push({
      date: day,
      inWindow: day >= from && day <= to && day >= today,
      availability: availabilityOf(day, care.state),
      rest: cal.events.some((e) => e.kind === 'rest' && e.start_date_local.slice(0, 10) === day),
      maxMinutes: care.state.days.find((d) => d.weekday === weekday)?.maxMinutes ?? null,
      existing,
      doneLoad: activities.filter((a) => a.start_date_local.slice(0, 10) === day).reduce((s, a) => s + (a.icu_training_load ?? 0), 0),
      blocked: blocked?.title ?? null,
    });
  }
  return { id, name: info.name ?? care.name, days, form, hrv, lastSleep, usualWeekLoad, daysSinceRide };
}

export async function registerAssignRoutes(app: FastifyInstance) {
  /** Meilleur jour et variante d'une séance pour chaque athlète choisi. */
  app.post<{ Body: SuggestBody }>('/assign/suggest', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();
    const input = validate(req.body);
    const team = new Set(await teamOf(me));
    const ids = input.athleteIds.filter((id) => team.has(id));

    const { blocks } = parseWorkoutText(input.description);
    const seconds = Math.round(estimatedSeconds(blocks, input.sport));
    const intensity = estimatedIntensity(blocks);
    const workout = { seconds, load: estimatedLoad(blocks), intensity };

    const settled = await Promise.allSettled(ids.map((id) => athleteInput(id, input.from, input.to, input.sport, intensity >= 1, seconds)));
    // Un seul appel au moteur pour toute l'équipe : il étale les athlètes sur la semaine.
    const ok = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const placed = new Map(suggest(workout, ok).map((sg) => [sg.athleteId, sg]));
    const suggestions: Suggestion[] = settled.map((r, i) => {
      if (r.status === 'fulfilled') return placed.get(r.value.id)!;
      req.log.warn({ err: r.reason, athleteId: ids[i] }, 'assign: athlète en erreur');
      return { athleteId: ids[i], name: ids[i], date: null, variant: 'standard', intensityScale: 1, reasons: ['Données indisponibles'], alternatives: [], replaces: null, blocked: 'Données indisponibles' };
    });
    return { suggestions };
  });
}
