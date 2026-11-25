import type { IntervalsAthlete } from '../types.js';
import { SPORTS, type Sport } from './sport.js';
import { BadRequest } from '../validation.js';

/**
 * Fiche profil (identité, physiologie, VMA, tests) — logique pure : sans
 * base ni réseau. Conversions d'unités, bornes de saisie, validation des
 * corps de requête et comparaison avec les valeurs d'Intervals.icu.
 *
 * Unités : `threshold_pace` d'Intervals.icu est en mètres par seconde.
 * Dans l'app, l'allure seuil est en secondes : s/km pour la course,
 * s/100 m pour la natation. v (m/s) = 1000 / (s/km) = 100 / (s/100 m).
 */

export type Physio = 'ftp' | 'lthr' | 'maxHr' | 'thresholdSecs';
export type Sex = 'M' | 'F';
export type UpdatedBy = 'athlete' | 'coach' | 'intervals';

export interface PhysioValues {
  ftp: number | null;
  lthr: number | null;
  maxHr: number | null;
  /** Course : s/km ; natation : s/100 m ; vélo : null. */
  thresholdSecs: number | null;
}

export interface IdentityValues {
  /** AAAA-MM-JJ */
  birthDate: string | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  restingHr: number | null;
}

export type Physiology = Record<Sport, PhysioValues>;

export interface ProfileValues {
  identity: IdentityValues;
  physiology: Physiology;
}

export type SuggestionField = Physio | 'birthDate' | 'sex' | 'heightCm' | 'weightKg' | 'restingHr';

/** Valeur proposée par Intervals.icu et différente de celle de l'app. */
export interface Suggestion {
  sport: Sport | null;
  field: SuggestionField;
  appValue: number | string | null;
  intervalsValue: number | string;
}

export interface StoredProfile {
  identity: IdentityValues;
  physiology: Physiology;
  vmaKmh: number | null;
  updatedBy: UpdatedBy;
  updatedAt: string;
  sync: { syncedAt: string | null; error: string | null };
}

export const TEST_KINDS = ['ftp', 'lthr', 'vma', 'run_threshold', 'swim_threshold', 'other'] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export interface TestRow {
  id: string;
  day: string;
  kind: TestKind;
  value: number;
  note: string | null;
  createdAt: string;
}

/** Persistance d'une fiche : base (src/db/profileRepo.ts) ou mémoire en mode démo (src/demoProfile.ts). */
export interface ProfileStore {
  load(): Promise<StoredProfile | null>;
  /** Première ouverture : copie les valeurs d'Intervals.icu (sans écraser une fiche existante). */
  importInitial(values: ProfileValues): Promise<void>;
  /** Scopes OAuth accordés à l'athlète (chaîne d'origine). */
  scope(): Promise<string>;
  saveIdentity(patch: Partial<IdentityValues>, by: UpdatedBy): Promise<void>;
  savePhysiology(sport: Sport, patch: Partial<PhysioValues>, by: UpdatedBy): Promise<void>;
  saveVma(vmaKmh: number | null, by: UpdatedBy): Promise<void>;
  /** `syncedAt` absent = inchangé ; `error` null = effacée. */
  setSync(state: { syncedAt?: Date; error: string | null }): Promise<void>;
  tests(): Promise<TestRow[]>;
  /** Insère un test seulement si l'athlète en a moins de `max` ; null sinon. */
  addTest(test: NewTest, max: number): Promise<TestRow | null>;
  deleteTest(testId: string): Promise<boolean>;
}

export interface NewTest {
  day: string;
  kind: TestKind;
  value: number;
  note: string | null;
}

/** Bornes de saisie : identiques côté BFF et web (lib/physio.ts reprend les mêmes). */
export const BOUNDS = {
  ftp: { min: 50, max: 600 },
  lthr: { min: 80, max: 220 },
  maxHr: { min: 100, max: 230 },
  restingHr: { min: 25, max: 110 },
  weightKg: { min: 30, max: 200 },
  heightCm: { min: 120, max: 230 },
  runThresholdSecs: { min: 150, max: 600 },
  swimThresholdSecs: { min: 60, max: 240 },
  vmaKmh: { min: 8, max: 25 },
  /** Date de naissance : pas avant 1930, et l'athlète a au moins 10 ans. */
  birthMin: '1930-01-01',
  /** Tests physiques par athlète. */
  maxTests: 50,
  /** Tests : pas avant 2000. */
  testMin: '2000-01-01',
  testValue: { min: 0.1, max: 9999.9 },
} as const;

/** Champs physiologiques qui ont un sens pour chaque sport. */
export const APPLICABLE: Record<Sport, readonly Physio[]> = {
  Ride: ['ftp', 'lthr', 'maxHr'],
  Run: ['lthr', 'maxHr', 'thresholdSecs'],
  Swim: ['thresholdSecs'],
};

export function thresholdBounds(sport: Sport): { min: number; max: number } {
  return sport === 'Swim' ? BOUNDS.swimThresholdSecs : BOUNDS.runThresholdSecs;
}

/** Sport d'un paramètre d'URL (strict : pas de valeur par défaut). */
export function physioSport(input: unknown): Sport {
  if (typeof input === 'string' && (SPORTS as readonly string[]).includes(input)) return input as Sport;
  throw new BadRequest('sport invalide (Ride, Run ou Swim)');
}

/* ---------- Conversions ---------- */

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** threshold_pace (m/s) → secondes (s/km pour la course, s/100 m pour la natation), à la seconde près. */
export function thresholdSecsOf(sport: 'Run' | 'Swim', metersPerSecond: number): number {
  return Math.round(sport === 'Run' ? 1000 / metersPerSecond : 100 / metersPerSecond);
}

/** Secondes → threshold_pace (m/s) attendu par Intervals.icu. */
export function thresholdPaceOf(sport: 'Run' | 'Swim', secs: number): number {
  return round6(sport === 'Run' ? 1000 / secs : 100 / secs);
}

/* ---------- Dates ---------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** AAAA-MM-JJ réel (rejette 2026-02-30). */
export function isValidDay(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

/** Date la plus récente admise pour une naissance : aujourd'hui moins 10 ans. */
export function maxBirthDate(today: string): string {
  const [y, m, d] = today.split('-');
  const candidate = `${Number(y) - 10}-${m}-${d}`;
  return isValidDay(candidate) ? candidate : `${Number(y) - 10}-02-28`; // 29 février
}

export function isValidBirthDate(s: unknown, today: string): s is string {
  return isValidDay(s) && s >= BOUNDS.birthMin && s <= maxBirthDate(today);
}

/* ---------- Valeurs issues d'Intervals.icu ---------- */

/** Entier arrondi dans les bornes, sinon null (une valeur hors bornes d'Intervals ne doit pas casser l'import). */
function intInBounds(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= min && n <= max ? n : null;
}

function decimalInBounds(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v * 10) / 10;
  return n >= min && n <= max ? n : null;
}

const EMPTY_PHYSIO: PhysioValues = { ftp: null, lthr: null, maxHr: null, thresholdSecs: null };

/** Valeurs de l'athlète telles qu'Intervals.icu les donne (groupe de sport contenant le type). */
export function snapshotOf(info: IntervalsAthlete, today: string): ProfileValues {
  const physioOf = (sport: Sport): PhysioValues => {
    const group = info.sportSettings?.find((g) => g.types?.includes(sport));
    if (!group) return { ...EMPTY_PHYSIO };
    const applicable = new Set<Physio>(APPLICABLE[sport]);
    const bounds = thresholdBounds(sport);
    const pace = group.threshold_pace;
    const thresholdSecs = sport !== 'Ride' && typeof pace === 'number' && pace > 0 ? intInBounds(thresholdSecsOf(sport, pace), bounds.min, bounds.max) : null;
    return {
      ftp: applicable.has('ftp') ? intInBounds(group.ftp, BOUNDS.ftp.min, BOUNDS.ftp.max) : null,
      lthr: applicable.has('lthr') ? intInBounds(group.lthr, BOUNDS.lthr.min, BOUNDS.lthr.max) : null,
      maxHr: applicable.has('maxHr') ? intInBounds(group.max_hr, BOUNDS.maxHr.min, BOUNDS.maxHr.max) : null,
      thresholdSecs: applicable.has('thresholdSecs') ? thresholdSecs : null,
    };
  };
  const birth = typeof info.icu_date_of_birth === 'string' ? info.icu_date_of_birth.slice(0, 10) : null;
  return {
    identity: {
      birthDate: birth && isValidBirthDate(birth, today) ? birth : null,
      sex: info.sex === 'M' || info.sex === 'F' ? info.sex : null,
      heightCm: intInBounds(info.height, BOUNDS.heightCm.min, BOUNDS.heightCm.max),
      weightKg: decimalInBounds(info.icu_weight, BOUNDS.weightKg.min, BOUNDS.weightKg.max),
      restingHr: intInBounds(info.icu_resting_hr, BOUNDS.restingHr.min, BOUNDS.restingHr.max),
    },
    physiology: { Ride: physioOf('Ride'), Run: physioOf('Run'), Swim: physioOf('Swim') },
  };
}

/** Patch à envoyer au groupe de sport d'Intervals.icu (seules les valeurs non nulles). */
export function intervalsSportPatch(sport: Sport, patch: Partial<PhysioValues>): { ftp?: number; lthr?: number; max_hr?: number; threshold_pace?: number } {
  const out: { ftp?: number; lthr?: number; max_hr?: number; threshold_pace?: number } = {};
  if (patch.ftp != null) out.ftp = patch.ftp;
  if (patch.lthr != null) out.lthr = patch.lthr;
  if (patch.maxHr != null) out.max_hr = patch.maxHr;
  if (patch.thresholdSecs != null && sport !== 'Ride') out.threshold_pace = thresholdPaceOf(sport, patch.thresholdSecs);
  return out;
}

/** Patch de l'athlète Intervals.icu. Un null efface le champ côté Intervals. */
export function intervalsIdentityPatch(patch: Partial<IdentityValues>): {
  icu_weight?: number | null;
  icu_resting_hr?: number | null;
  sex?: Sex | null;
  height?: number | null;
  icu_date_of_birth?: string | null;
} {
  const out: ReturnType<typeof intervalsIdentityPatch> = {};
  if ('weightKg' in patch) out.icu_weight = patch.weightKg ?? null;
  if ('restingHr' in patch) out.icu_resting_hr = patch.restingHr ?? null;
  if ('sex' in patch) out.sex = patch.sex ?? null;
  if ('heightCm' in patch) out.height = patch.heightCm ?? null;
  if ('birthDate' in patch) out.icu_date_of_birth = patch.birthDate ?? null;
  return out;
}

/** Forme du jour : poids et FC de repos (seules les valeurs renseignées). */
export function wellnessPatch(identity: Partial<IdentityValues>): { weight?: number; restingHR?: number } {
  const out: { weight?: number; restingHR?: number } = {};
  if (identity.weightKg != null) out.weight = identity.weightKg;
  if (identity.restingHr != null) out.restingHR = identity.restingHr;
  return out;
}

/* ---------- Comparaison avec Intervals.icu ---------- */

/**
 * Une suggestion par champ où Intervals.icu a une valeur différente de l'app
 * (une valeur absente côté app compte comme différente). Après un envoi
 * réussi les valeurs sont égales : plus de suggestion.
 */
export function compareWithIntervals(app: ProfileValues, intervals: ProfileValues): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (sport: Sport | null, field: SuggestionField, appValue: number | string | null, intervalsValue: number | string | null) => {
    if (intervalsValue !== null && intervalsValue !== appValue) out.push({ sport, field, appValue, intervalsValue });
  };
  const id = app.identity;
  const iv = intervals.identity;
  add(null, 'birthDate', id.birthDate, iv.birthDate);
  add(null, 'sex', id.sex, iv.sex);
  add(null, 'heightCm', id.heightCm, iv.heightCm);
  add(null, 'weightKg', id.weightKg, iv.weightKg);
  add(null, 'restingHr', id.restingHr, iv.restingHr);
  for (const sport of SPORTS) {
    for (const field of APPLICABLE[sport]) {
      add(sport, field, app.physiology[sport][field], intervals.physiology[sport][field]);
    }
  }
  return out;
}

/* ---------- Validation des corps de requête ---------- */

function bodyOf(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('corps JSON attendu');
  return body as Record<string, unknown>;
}

function numberIn(v: unknown, name: string, min: number, max: number, integer: boolean): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BadRequest(`${name} : nombre attendu`);
  const n = integer ? v : Math.round(v * 10) / 10;
  if (integer && !Number.isInteger(v)) throw new BadRequest(`${name} : nombre entier attendu`);
  if (n < min || n > max) throw new BadRequest(`${name} : entre ${min} et ${max}`);
  return n;
}

/** Patch d'identité : seules les clés présentes ; null efface. */
export function parseIdentityPatch(body: unknown, today: string): Partial<IdentityValues> {
  const b = bodyOf(body);
  const out: Partial<IdentityValues> = {};
  if ('birthDate' in b) {
    if (b.birthDate === null) out.birthDate = null;
    else if (isValidBirthDate(b.birthDate, today)) out.birthDate = b.birthDate;
    else throw new BadRequest(`date de naissance : entre ${BOUNDS.birthMin} et ${maxBirthDate(today)}`);
  }
  if ('sex' in b) {
    if (b.sex === null || b.sex === 'M' || b.sex === 'F') out.sex = b.sex;
    else throw new BadRequest('sexe : M, F ou null');
  }
  if ('heightCm' in b) out.heightCm = b.heightCm === null ? null : numberIn(b.heightCm, 'taille', BOUNDS.heightCm.min, BOUNDS.heightCm.max, true);
  if ('weightKg' in b) out.weightKg = b.weightKg === null ? null : numberIn(b.weightKg, 'poids', BOUNDS.weightKg.min, BOUNDS.weightKg.max, false);
  if ('restingHr' in b) out.restingHr = b.restingHr === null ? null : numberIn(b.restingHr, 'FC de repos', BOUNDS.restingHr.min, BOUNDS.restingHr.max, true);
  return out;
}

/** Patch physiologique d'un sport : refuse les champs qui n'ont pas de sens pour ce sport. */
export function parsePhysioPatch(sport: Sport, body: unknown): Partial<PhysioValues> {
  const b = bodyOf(body);
  const applicable = new Set<string>(APPLICABLE[sport]);
  const out: Partial<PhysioValues> = {};
  const fields: Array<[keyof PhysioValues, string]> = [
    ['ftp', 'FTP'],
    ['lthr', 'FC seuil'],
    ['maxHr', 'FC max'],
    ['thresholdSecs', 'allure seuil'],
  ];
  for (const [field, label] of fields) {
    if (!(field in b)) continue;
    if (!applicable.has(field)) throw new BadRequest(`${label} non applicable à ce sport`);
    if (b[field] === null) {
      out[field] = null;
      continue;
    }
    if (field === 'ftp') out.ftp = numberIn(b.ftp, label, BOUNDS.ftp.min, BOUNDS.ftp.max, true);
    if (field === 'lthr') out.lthr = numberIn(b.lthr, label, BOUNDS.lthr.min, BOUNDS.lthr.max, true);
    if (field === 'maxHr') out.maxHr = numberIn(b.maxHr, label, BOUNDS.maxHr.min, BOUNDS.maxHr.max, true);
    if (field === 'thresholdSecs') {
      const bounds = thresholdBounds(sport);
      out.thresholdSecs = numberIn(b.thresholdSecs, label, bounds.min, bounds.max, true);
    }
  }
  return out;
}

export function parseVma(body: unknown): number | null {
  const b = bodyOf(body);
  if (!('vmaKmh' in b)) throw new BadRequest('vmaKmh requis');
  if (b.vmaKmh === null) return null;
  return numberIn(b.vmaKmh, 'VMA', BOUNDS.vmaKmh.min, BOUNDS.vmaKmh.max, false);
}

const TEST_LIMITS: Record<TestKind, { min: number; max: number }> = {
  ftp: BOUNDS.ftp,
  lthr: BOUNDS.lthr,
  vma: BOUNDS.vmaKmh,
  run_threshold: BOUNDS.runThresholdSecs,
  swim_threshold: BOUNDS.swimThresholdSecs,
  other: BOUNDS.testValue,
};

/** Où va la valeur d'un test quand il met à jour le profil (`apply`). */
export function testTarget(kind: TestKind): { sport: Sport; field: Physio } | { vma: true } | null {
  switch (kind) {
    case 'ftp':
      return { sport: 'Ride', field: 'ftp' };
    case 'lthr':
      return { sport: 'Ride', field: 'lthr' };
    case 'vma':
      return { vma: true };
    case 'run_threshold':
      return { sport: 'Run', field: 'thresholdSecs' };
    case 'swim_threshold':
      return { sport: 'Swim', field: 'thresholdSecs' };
    default:
      return null;
  }
}

export function parseTest(body: unknown, today: string): { test: NewTest; apply: boolean } {
  const b = bodyOf(body);
  if (!isValidDay(b.day) || b.day < BOUNDS.testMin || b.day > today) throw new BadRequest(`date du test : entre ${BOUNDS.testMin} et aujourd'hui`);
  if (typeof b.kind !== 'string' || !(TEST_KINDS as readonly string[]).includes(b.kind)) throw new BadRequest('type de test invalide');
  const kind = b.kind as TestKind;
  const limits = TEST_LIMITS[kind];
  const value = numberIn(b.value, 'valeur du test', limits.min, limits.max, false);
  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== 'string') throw new BadRequest('note : texte attendu');
    if (b.note.length > 300) throw new BadRequest('note trop longue (max 300 car.)');
    note = b.note.trim() || null;
  }
  const apply = b.apply === true;
  if (apply && testTarget(kind) === null) throw new BadRequest('ce type de test ne met pas le profil à jour');
  return { test: { day: b.day, kind, value, note }, apply };
}
