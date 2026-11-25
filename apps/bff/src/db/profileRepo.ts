import { SPORTS, type Sport } from '../lib/sport.js';
import {
  type IdentityValues,
  type NewTest,
  type PhysioValues,
  type ProfileStore,
  type ProfileValues,
  type StoredProfile,
  type TestKind,
  type TestRow,
  type UpdatedBy,
} from '../lib/profile.js';
import { affected, db } from './index.js';

/**
 * Requêtes de la fiche profil (migration 006). Toutes filtrées par
 * `user_id` : la barrière d'isolation, comme dans repo.ts.
 * Les `numeric` reviennent en chaîne depuis pg : converties ici. Les `date`
 * sont lues en texte (to_char) pour éviter un Date JavaScript.
 */

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (v: unknown): string => new Date(v as string | Date).toISOString();

interface ProfileRow {
  birth_date: string | null;
  sex: 'M' | 'F' | null;
  height_cm: number | null;
  weight_kg: string | null;
  resting_hr: number | null;
  vma_kmh: string | null;
  updated_by: UpdatedBy;
  updated_at: Date;
  synced_at: Date | null;
  sync_error: string | null;
}

interface PhysioRow {
  sport: Sport;
  ftp: number | null;
  lthr: number | null;
  max_hr: number | null;
  threshold_secs: number | null;
}

interface TestDbRow {
  id: string;
  day: string;
  kind: TestKind;
  value: string;
  note: string | null;
  created_at: Date;
}

const emptyPhysio = (): PhysioValues => ({ ftp: null, lthr: null, maxHr: null, thresholdSecs: null });

async function loadProfile(userId: string): Promise<StoredProfile | null> {
  const { rows } = await db().query<ProfileRow>(
    `select to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, height_cm, weight_kg, resting_hr, vma_kmh,
            updated_by, updated_at, synced_at, sync_error
     from athlete_profile where user_id = $1`,
    [userId],
  );
  const p = rows[0];
  if (!p) return null;
  const phys = await db().query<PhysioRow>(
    `select sport, ftp, lthr, max_hr, threshold_secs from athlete_physiology where user_id = $1`,
    [userId],
  );
  const physiology = { Ride: emptyPhysio(), Run: emptyPhysio(), Swim: emptyPhysio() };
  for (const r of phys.rows) {
    physiology[r.sport] = { ftp: r.ftp, lthr: r.lthr, maxHr: r.max_hr, thresholdSecs: r.threshold_secs };
  }
  return {
    identity: {
      birthDate: p.birth_date,
      sex: p.sex,
      heightCm: p.height_cm,
      weightKg: num(p.weight_kg),
      restingHr: p.resting_hr,
    },
    physiology,
    vmaKmh: num(p.vma_kmh),
    updatedBy: p.updated_by,
    updatedAt: iso(p.updated_at),
    sync: { syncedAt: p.synced_at ? iso(p.synced_at) : null, error: p.sync_error },
  };
}

async function importInitial(userId: string, v: ProfileValues): Promise<void> {
  await db().transaction(async (tx) => {
    const id = v.identity;
    await tx.query(
      `insert into athlete_profile (user_id, birth_date, sex, height_cm, weight_kg, resting_hr, updated_by)
       values ($1, $2::date, $3, $4, $5, $6, 'intervals')
       on conflict (user_id) do nothing`,
      [userId, id.birthDate, id.sex, id.heightCm, id.weightKg, id.restingHr],
    );
    for (const sport of SPORTS) {
      const p = v.physiology[sport];
      await tx.query(
        `insert into athlete_physiology (user_id, sport, ftp, lthr, max_hr, threshold_secs, updated_by)
         values ($1, $2, $3, $4, $5, $6, 'intervals')
         on conflict (user_id, sport) do nothing`,
        [userId, sport, p.ftp, p.lthr, p.maxHr, p.thresholdSecs],
      );
    }
  });
}

/**
 * Mise à jour partielle : chaque colonne n'est modifiée que si son champ est
 * dans le patch (drapeau `has*`). Une seule instruction, donc atomique.
 */
async function saveIdentity(userId: string, patch: Partial<IdentityValues>, by: UpdatedBy): Promise<void> {
  const has = (k: keyof IdentityValues) => k in patch;
  await db().transaction(async (tx) => {
    await tx.query(
      `insert into athlete_profile (user_id, updated_by, updated_at) values ($1, $2, now())
       on conflict (user_id) do update set
         birth_date = case when $3 then $4::date else athlete_profile.birth_date end,
         sex = case when $5 then $6::text else athlete_profile.sex end,
         height_cm = case when $7 then $8::smallint else athlete_profile.height_cm end,
         weight_kg = case when $9 then $10::numeric else athlete_profile.weight_kg end,
         resting_hr = case when $11 then $12::smallint else athlete_profile.resting_hr end,
         updated_by = $2, updated_at = now()`,
      [
        userId,
        by,
        has('birthDate'),
        patch.birthDate ?? null,
        has('sex'),
        patch.sex ?? null,
        has('heightCm'),
        patch.heightCm ?? null,
        has('weightKg'),
        patch.weightKg ?? null,
        has('restingHr'),
        patch.restingHr ?? null,
      ],
    );
  });
}

async function savePhysiology(userId: string, sport: Sport, patch: Partial<PhysioValues>, by: UpdatedBy): Promise<void> {
  const has = (k: keyof PhysioValues) => k in patch;
  await db().transaction(async (tx) => {
    await tx.query(
      `insert into athlete_physiology (user_id, sport, updated_by) values ($1, $2, $3)
       on conflict (user_id, sport) do update set
         ftp = case when $4 then $5::smallint else athlete_physiology.ftp end,
         lthr = case when $6 then $7::smallint else athlete_physiology.lthr end,
         max_hr = case when $8 then $9::smallint else athlete_physiology.max_hr end,
         threshold_secs = case when $10 then $11::smallint else athlete_physiology.threshold_secs end,
         updated_by = $3, updated_at = now()`,
      [userId, sport, by, has('ftp'), patch.ftp ?? null, has('lthr'), patch.lthr ?? null, has('maxHr'), patch.maxHr ?? null, has('thresholdSecs'), patch.thresholdSecs ?? null],
    );
    await tx.query(`update athlete_profile set updated_by = $2, updated_at = now() where user_id = $1`, [userId, by]);
  });
}

async function saveVma(userId: string, vmaKmh: number | null, by: UpdatedBy): Promise<void> {
  await db().query(`update athlete_profile set vma_kmh = $2::numeric, updated_by = $3, updated_at = now() where user_id = $1`, [userId, vmaKmh, by]);
}

/** `syncedAt` null = inchangé (coalesce) ; `error` remplace l'état précédent. */
async function setSync(userId: string, state: { syncedAt?: Date; error: string | null }): Promise<void> {
  await db().query(`update athlete_profile set synced_at = coalesce($2::timestamptz, synced_at), sync_error = $3 where user_id = $1`, [
    userId,
    state.syncedAt ? state.syncedAt.toISOString() : null,
    state.error,
  ]);
}

async function scopeOf(userId: string): Promise<string> {
  const { rows } = await db().query<{ scope: string }>(`select scope from intervals_tokens where user_id = $1`, [userId]);
  return rows[0]?.scope ?? '';
}

const testOf = (r: TestDbRow): TestRow => ({
  id: r.id,
  day: r.day,
  kind: r.kind,
  value: Number(r.value),
  note: r.note,
  createdAt: iso(r.created_at),
});

async function testsOf(userId: string): Promise<TestRow[]> {
  const { rows } = await db().query<TestDbRow>(
    `select id, to_char(day, 'YYYY-MM-DD') as day, kind, value, note, created_at
     from physio_tests where user_id = $1 order by day desc, created_at desc`,
    [userId],
  );
  return rows.map(testOf);
}

/** Insertion atomique : refusée (null) quand l'athlète a déjà `max` tests. */
async function addTest(userId: string, t: NewTest, max: number): Promise<TestRow | null> {
  const { rows } = await db().query<TestDbRow>(
    `insert into physio_tests (user_id, day, kind, value, note)
     select $1, $2::date, $3, $4::numeric, $5 where (select count(*) from physio_tests where user_id = $1) < $6
     returning id, to_char(day, 'YYYY-MM-DD') as day, kind, value, note, created_at`,
    [userId, t.day, t.kind, t.value, t.note, max],
  );
  return rows[0] ? testOf(rows[0]) : null;
}

async function deleteTest(userId: string, testId: string): Promise<boolean> {
  return affected(await db().query(`delete from physio_tests where user_id = $1 and id = $2`, [userId, testId])) > 0;
}

/** Accès à la fiche d'un utilisateur de la base, avec les opérations ci-dessus. */
export function dbProfileStore(userId: string): ProfileStore {
  return {
    load: () => loadProfile(userId),
    importInitial: (v) => importInitial(userId, v),
    scope: () => scopeOf(userId),
    saveIdentity: (patch, by) => saveIdentity(userId, patch, by),
    savePhysiology: (sport, patch, by) => savePhysiology(userId, sport, patch, by),
    saveVma: (vma, by) => saveVma(userId, vma, by),
    setSync: (state) => setSync(userId, state),
    tests: () => testsOf(userId),
    addTest: (t, max) => addTest(userId, t, max),
    deleteTest: (id) => deleteTest(userId, id),
  };
}
