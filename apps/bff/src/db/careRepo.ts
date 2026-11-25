import { db, type Db } from './index.js';
import { CARE_LIMITS, defaultDays, DEFAULT_EQUIPMENT, type AvailabilityException, type AvailabilityInput, type CareState, type Equipment, type ExceptionInput, type Injury, type InjuryInput, type Place, type Slot } from '../lib/care.js';
import type { Sport } from '../lib/sport.js';

/**
 * Requêtes de la fiche « soin » (semaine type, matériel, exceptions,
 * blessures). Toutes filtrées par `user_id` : c'est la barrière d'isolation.
 * Chaque écriture met à jour `athlete_care.updated_by` / `updated_at`.
 */

/** Interface commune à la base (ici) et à la démo en mémoire (demoCare.ts). */
export interface CareStore {
  read(): Promise<CareState>;
  replaceAvailability(input: AvailabilityInput, by: Actor): Promise<void>;
  setEquipment(equipment: Equipment, by: Actor): Promise<void>;
  addException(input: ExceptionInput, by: Actor): Promise<AvailabilityException | null>;
  deleteException(id: string, by: Actor): Promise<boolean>;
  addInjury(input: InjuryInput, by: Actor): Promise<Injury | null>;
  updateInjury(id: string, input: InjuryInput, by: Actor): Promise<Injury | null>;
  deleteInjury(id: string, by: Actor): Promise<boolean>;
}

export type Actor = 'athlete' | 'coach';

type Tx = Pick<Db, 'query' | 'exec'>;

const EXC_COLS = `id, to_char(from_day, 'YYYY-MM-DD') as from_day, to_char(to_day, 'YYYY-MM-DD') as to_day, note`;
const INJ_COLS = `id, title, to_char(started_on, 'YYYY-MM-DD') as started_on, to_char(expected_end, 'YYYY-MM-DD') as expected_end,
  to_char(ended_on, 'YYYY-MM-DD') as ended_on, avoid_sports, avoid_intensity, note`;

interface AvailabilityDbRow {
  weekday: number;
  available: boolean;
  max_minutes: number | null;
  slot: Slot;
  place: Place;
}

interface CareDbRow {
  weekly_minutes: number | null;
  power_meter: boolean;
  hr_strap: boolean;
  smart_trainer: boolean;
  pool_access: boolean;
  updated_at: Date;
  updated_by: Actor;
}

interface ExceptionDbRow {
  id: string;
  from_day: string;
  to_day: string;
  note: string | null;
}

const exceptionOf = (r: ExceptionDbRow): AvailabilityException => ({ id: r.id, fromDay: r.from_day, toDay: r.to_day, note: r.note });

interface InjuryDbRow {
  id: string;
  title: string;
  started_on: string;
  expected_end: string | null;
  ended_on: string | null;
  avoid_sports: Sport[];
  avoid_intensity: boolean;
  note: string | null;
}

const injuryOf = (r: InjuryDbRow): Injury => ({
  id: r.id,
  title: r.title,
  startedOn: r.started_on,
  expectedEnd: r.expected_end,
  endedOn: r.ended_on,
  avoidSports: r.avoid_sports ?? [],
  avoidIntensity: r.avoid_intensity,
  note: r.note,
});

/** Trace qui a modifié la fiche (crée la ligne `athlete_care` si besoin). */
async function touchCare(tx: Tx, userId: string, by: Actor): Promise<void> {
  await tx.query(
    `insert into athlete_care (user_id, updated_by, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set updated_by = excluded.updated_by, updated_at = now()`,
    [userId, by],
  );
}

export function dbCareStore(userId: string): CareStore {
  const d = db();

  return {
    async read(): Promise<CareState> {
      const [care, availability, exceptions, injuries] = await Promise.all([
        d.query<CareDbRow>(
          `select weekly_minutes, power_meter, hr_strap, smart_trainer, pool_access, updated_at, updated_by
           from athlete_care where user_id = $1`,
          [userId],
        ),
        d.query<AvailabilityDbRow>(
          `select weekday, available, max_minutes, slot, place from athlete_availability where user_id = $1 order by weekday`,
          [userId],
        ),
        d.query<ExceptionDbRow>(
          `select ${EXC_COLS} from availability_exceptions where user_id = $1 order by from_day, id`,
          [userId],
        ),
        d.query<InjuryDbRow>(`select ${INJ_COLS} from injuries where user_id = $1 order by started_on desc, id`, [userId]),
      ]);

      const days = defaultDays();
      for (const r of availability.rows) {
        days[r.weekday] = { weekday: r.weekday, available: r.available, maxMinutes: r.max_minutes, slot: r.slot, place: r.place };
      }
      const c = care.rows[0];
      const equipment: Equipment = c
        ? { powerMeter: c.power_meter, hrStrap: c.hr_strap, smartTrainer: c.smart_trainer, poolAccess: c.pool_access }
        : DEFAULT_EQUIPMENT;
      return {
        weeklyMinutes: c?.weekly_minutes ?? null,
        days,
        exceptions: exceptions.rows.map(exceptionOf),
        equipment,
        injuries: injuries.rows.map(injuryOf),
        updatedBy: c?.updated_by ?? 'athlete',
        updatedAt: c ? new Date(c.updated_at).toISOString() : null,
      };
    },

    async replaceAvailability(input, by) {
      await d.transaction(async (tx) => {
        await tx.query('delete from athlete_availability where user_id = $1', [userId]);
        for (const day of input.days) {
          await tx.query(
            `insert into athlete_availability (user_id, weekday, available, max_minutes, slot, place) values ($1, $2, $3, $4, $5, $6)`,
            [userId, day.weekday, day.available, day.maxMinutes, day.slot, day.place],
          );
        }
        await tx.query(
          `insert into athlete_care (user_id, weekly_minutes, updated_by, updated_at) values ($1, $2, $3, now())
           on conflict (user_id) do update set weekly_minutes = excluded.weekly_minutes, updated_by = excluded.updated_by, updated_at = now()`,
          [userId, input.weeklyMinutes, by],
        );
      });
    },

    async setEquipment(eq, by) {
      await d.transaction(async (tx) => {
        await tx.query(
          `insert into athlete_care (user_id, power_meter, hr_strap, smart_trainer, pool_access, updated_by, updated_at)
           values ($1, $2, $3, $4, $5, $6, now())
           on conflict (user_id) do update set power_meter = excluded.power_meter, hr_strap = excluded.hr_strap,
             smart_trainer = excluded.smart_trainer, pool_access = excluded.pool_access, updated_by = excluded.updated_by, updated_at = now()`,
          [userId, eq.powerMeter, eq.hrStrap, eq.smartTrainer, eq.poolAccess, by],
        );
      });
    },

    async addException(input, by) {
      // Insertion atomique : la limite est testée dans la même instruction.
      return d.transaction(async (tx) => {
        const { rows } = await tx.query<ExceptionDbRow>(
          `insert into availability_exceptions (user_id, from_day, to_day, note)
           select $1, $2, $3, $4 where (select count(*) from availability_exceptions where user_id = $1) < $5
           returning ${EXC_COLS}`,
          [userId, input.fromDay, input.toDay, input.note, CARE_LIMITS.maxExceptions],
        );
        if (!rows[0]) return null;
        await touchCare(tx, userId, by);
        return exceptionOf(rows[0]);
      });
    },

    async deleteException(id, by) {
      return d.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>('delete from availability_exceptions where user_id = $1 and id = $2 returning id', [userId, id]);
        if (rows.length === 0) return false;
        await touchCare(tx, userId, by);
        return true;
      });
    },

    async addInjury(input, by) {
      return d.transaction(async (tx) => {
        const { rows } = await tx.query<InjuryDbRow>(
          `insert into injuries (user_id, title, started_on, expected_end, ended_on, avoid_sports, avoid_intensity, note)
           select $1, $2, $3, $4, $5, $6, $7, $8 where (select count(*) from injuries where user_id = $1) < $9
           returning ${INJ_COLS}`,
          [userId, input.title, input.startedOn, input.expectedEnd, input.endedOn, input.avoidSports, input.avoidIntensity, input.note, CARE_LIMITS.maxInjuries],
        );
        if (!rows[0]) return null;
        await touchCare(tx, userId, by);
        return injuryOf(rows[0]);
      });
    },

    async updateInjury(id, input, by) {
      return d.transaction(async (tx) => {
        const { rows } = await tx.query<InjuryDbRow>(
          `update injuries set title = $3, started_on = $4, expected_end = $5, ended_on = $6, avoid_sports = $7,
             avoid_intensity = $8, note = $9, updated_at = now()
           where user_id = $1 and id = $2 returning ${INJ_COLS}`,
          [userId, id, input.title, input.startedOn, input.expectedEnd, input.endedOn, input.avoidSports, input.avoidIntensity, input.note],
        );
        if (!rows[0]) return null;
        await touchCare(tx, userId, by);
        return injuryOf(rows[0]);
      });
    },

    async deleteInjury(id, by) {
      return d.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>('delete from injuries where user_id = $1 and id = $2 returning id', [userId, id]);
        if (rows.length === 0) return false;
        await touchCare(tx, userId, by);
        return true;
      });
    },
  };
}
