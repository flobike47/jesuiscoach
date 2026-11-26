import { db } from './index.js';
import type { CalendarRow, CreatedBy, EventKind, EventOrigin, GoalInput, GoalMetric, GoalRow, RacePriority, SyncStatus } from '../lib/calendar.js';
import type { Sport } from '../lib/sport.js';

/**
 * Requêtes du calendrier et des objectifs. Toutes filtrées par `user_id` :
 * c'est la barrière d'isolation (pas de RLS). Requêtes paramétrées.
 * Interface commune à la base (ici) et à la démo en mémoire (demoCalendar.ts).
 */

/** Ligne à insérer : tout sauf l'id et la date de mise à jour. */
export type NewCalendarRow = Omit<CalendarRow, 'id' | 'updatedAt'>;

export interface CalendarStore {
  /** Lignes dont le jour est dans [from, to]. */
  list(from: string, to: string): Promise<CalendarRow[]>;
  /** Par id de ligne (uuid) ou par id Intervals.icu. */
  find(ref: string): Promise<CalendarRow | null>;
  /** Insère ; null si `maxFuture` est atteint pour les jours à venir. */
  insert(row: NewCalendarRow, maxFuture: number): Promise<CalendarRow | null>;
  /** Remplace les champs modifiables d'une ligne (et met `updatedAt` à maintenant). */
  update(id: string, row: NewCalendarRow): Promise<CalendarRow | null>;
  remove(id: string): Promise<boolean>;
  /** Compétitions à partir de `from`, triées par jour. */
  races(from: string): Promise<CalendarRow[]>;
  raceExists(id: string): Promise<boolean>;
  goals(): Promise<GoalRow[]>;
  goal(id: string): Promise<GoalRow | null>;
  insertGoal(g: GoalInput, createdBy: 'athlete' | 'coach', max: number): Promise<GoalRow | null>;
  updateGoal(id: string, g: GoalInput): Promise<GoalRow | null>;
  deleteGoal(id: string): Promise<boolean>;
}

interface CalRow {
  id: string;
  kind: EventKind;
  sport: Sport | null;
  day: string;
  name: string;
  description: string | null;
  race_priority: RacePriority | null;
  race_distance_m: number | null;
  race_goal: string | null;
  origin: EventOrigin;
  intervals_id: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  created_by: CreatedBy;
  updated_at: Date;
}

const CAL_COLS = `id, kind, sport, to_char(day, 'YYYY-MM-DD') as day, name, description, race_priority, race_distance_m, race_goal,
  origin, intervals_id, sync_status, sync_error, created_by, updated_at`;

const calOf = (r: CalRow): CalendarRow => ({
  id: r.id,
  kind: r.kind,
  sport: r.sport,
  day: r.day,
  name: r.name,
  description: r.description,
  racePriority: r.race_priority,
  raceDistanceM: r.race_distance_m,
  raceGoal: r.race_goal,
  origin: r.origin,
  intervalsId: r.intervals_id,
  syncStatus: r.sync_status,
  syncError: r.sync_error,
  createdBy: r.created_by,
  updatedAt: new Date(r.updated_at).toISOString(),
});

interface GoalDbRow {
  id: string;
  title: string;
  metric: GoalMetric | null;
  target_value: string | number | null;
  due_day: string | null;
  race_id: string | null;
  achieved_on: string | null;
  note: string | null;
  created_by: 'athlete' | 'coach';
  updated_at: Date;
}

const GOAL_COLS = `id, title, metric, target_value, to_char(due_day, 'YYYY-MM-DD') as due_day, race_id,
  to_char(achieved_on, 'YYYY-MM-DD') as achieved_on, note, created_by, updated_at`;

const goalOf = (r: GoalDbRow): GoalRow => ({
  id: r.id,
  title: r.title,
  metric: r.metric,
  targetValue: r.target_value == null ? null : Number(r.target_value),
  dueDay: r.due_day,
  raceId: r.race_id,
  achievedOn: r.achieved_on,
  note: r.note,
  createdBy: r.created_by,
  updatedAt: new Date(r.updated_at).toISOString(),
});

export function dbCalendarStore(userId: string): CalendarStore {
  const d = db();
  return {
    async list(from, to) {
      const { rows } = await d.query<CalRow>(
        `select ${CAL_COLS} from calendar_events where user_id = $1 and day between $2 and $3 order by day, created_at, id`,
        [userId, from, to],
      );
      return rows.map(calOf);
    },

    async find(ref) {
      const { rows } = await d.query<CalRow>(
        `select ${CAL_COLS} from calendar_events where user_id = $1 and (id::text = $2 or intervals_id = $2) limit 1`,
        [userId, ref],
      );
      return rows[0] ? calOf(rows[0]) : null;
    },

    async insert(r, maxFuture) {
      const { rows } = await d.query<CalRow>(
        `insert into calendar_events (user_id, kind, sport, day, name, description, race_priority, race_distance_m, race_goal,
            origin, intervals_id, sync_status, sync_error, created_by)
         select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
         where (select count(*) from calendar_events where user_id = $1 and day >= current_date) < $15
            or $4::date < current_date
         returning ${CAL_COLS}`,
        [userId, r.kind, r.sport, r.day, r.name, r.description, r.racePriority, r.raceDistanceM, r.raceGoal, r.origin, r.intervalsId, r.syncStatus, r.syncError, r.createdBy, maxFuture],
      );
      return rows[0] ? calOf(rows[0]) : null;
    },

    async update(id, r) {
      const { rows } = await d.query<CalRow>(
        `update calendar_events set kind = $3, sport = $4, day = $5, name = $6, description = $7, race_priority = $8,
            race_distance_m = $9, race_goal = $10, intervals_id = $11, sync_status = $12, sync_error = $13, updated_at = now()
         where user_id = $1 and id = $2
         returning ${CAL_COLS}`,
        [userId, id, r.kind, r.sport, r.day, r.name, r.description, r.racePriority, r.raceDistanceM, r.raceGoal, r.intervalsId, r.syncStatus, r.syncError],
      );
      return rows[0] ? calOf(rows[0]) : null;
    },

    async remove(id) {
      const res = await d.query('delete from calendar_events where user_id = $1 and id = $2', [userId, id]);
      return (res.rowCount ?? res.affectedRows ?? 0) > 0;
    },

    async races(from) {
      const { rows } = await d.query<CalRow>(
        `select ${CAL_COLS} from calendar_events where user_id = $1 and kind = 'race' and day >= $2 order by day, id`,
        [userId, from],
      );
      return rows.map(calOf);
    },

    async raceExists(id) {
      const { rows } = await d.query(`select 1 from calendar_events where user_id = $1 and id = $2 and kind = 'race'`, [userId, id]);
      return rows.length > 0;
    },

    async goals() {
      const { rows } = await d.query<GoalDbRow>(`select ${GOAL_COLS} from goals where user_id = $1 order by due_day nulls last, created_at, id`, [userId]);
      return rows.map(goalOf);
    },

    async goal(id) {
      const { rows } = await d.query<GoalDbRow>(`select ${GOAL_COLS} from goals where user_id = $1 and id = $2`, [userId, id]);
      return rows[0] ? goalOf(rows[0]) : null;
    },

    async insertGoal(g, createdBy, max) {
      const { rows } = await d.query<GoalDbRow>(
        `insert into goals (user_id, title, metric, target_value, due_day, race_id, achieved_on, note, created_by)
         select $1, $2, $3, $4, $5, $6, $7, $8, $9
         where (select count(*) from goals where user_id = $1) < $10
         returning ${GOAL_COLS}`,
        [userId, g.title, g.metric, g.targetValue, g.dueDay, g.raceId, g.achievedOn, g.note, createdBy, max],
      );
      return rows[0] ? goalOf(rows[0]) : null;
    },

    async updateGoal(id, g) {
      const { rows } = await d.query<GoalDbRow>(
        `update goals set title = $3, metric = $4, target_value = $5, due_day = $6, race_id = $7, achieved_on = $8, note = $9, updated_at = now()
         where user_id = $1 and id = $2 returning ${GOAL_COLS}`,
        [userId, id, g.title, g.metric, g.targetValue, g.dueDay, g.raceId, g.achievedOn, g.note],
      );
      return rows[0] ? goalOf(rows[0]) : null;
    },

    async deleteGoal(id) {
      const res = await d.query('delete from goals where user_id = $1 and id = $2', [userId, id]);
      return (res.rowCount ?? res.affectedRows ?? 0) > 0;
    },
  };
}
