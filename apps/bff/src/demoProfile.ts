import { randomUUID } from 'node:crypto';
import type { Sport } from './lib/sport.js';
import type { IdentityValues, NewTest, PhysioValues, ProfileStore, ProfileValues, StoredProfile, TestRow, UpdatedBy } from './lib/profile.js';

/**
 * Fiche profil en mémoire pour les athlètes démo (ils n'existent pas en
 * base). Perdue au redémarrage, comme le reste des données démo. Même
 * contrat que `dbProfileStore` (db/profileRepo.ts).
 */

interface DemoState {
  identity: IdentityValues;
  physiology: Record<Sport, PhysioValues>;
  vmaKmh: number | null;
  updatedBy: UpdatedBy;
  updatedAt: Date;
  syncedAt: Date | null;
  syncError: string | null;
  tests: TestRow[];
}

const states = new Map<string, DemoState>();

const emptyPhysio = (): PhysioValues => ({ ftp: null, lthr: null, maxHr: null, thresholdSecs: null });

function ensure(athleteId: string): DemoState {
  let s = states.get(athleteId);
  if (!s) {
    s = {
      identity: { birthDate: null, sex: null, heightCm: null, weightKg: null, restingHr: null },
      physiology: { Ride: emptyPhysio(), Run: emptyPhysio(), Swim: emptyPhysio() },
      vmaKmh: null,
      updatedBy: 'athlete',
      updatedAt: new Date(),
      syncedAt: null,
      syncError: null,
      tests: [],
    };
    states.set(athleteId, s);
  }
  return s;
}

function touch(s: DemoState, by: UpdatedBy) {
  s.updatedBy = by;
  s.updatedAt = new Date();
}

export function demoProfileStore(athleteId: string): ProfileStore {
  return {
    async load(): Promise<StoredProfile | null> {
      const s = states.get(athleteId);
      if (!s) return null;
      return {
        identity: { ...s.identity },
        physiology: { Ride: { ...s.physiology.Ride }, Run: { ...s.physiology.Run }, Swim: { ...s.physiology.Swim } },
        vmaKmh: s.vmaKmh,
        updatedBy: s.updatedBy,
        updatedAt: s.updatedAt.toISOString(),
        sync: { syncedAt: s.syncedAt?.toISOString() ?? null, error: s.syncError },
      };
    },
    async importInitial(v: ProfileValues) {
      if (states.has(athleteId)) return;
      const s = ensure(athleteId);
      s.identity = { ...v.identity };
      s.physiology = { Ride: { ...v.physiology.Ride }, Run: { ...v.physiology.Run }, Swim: { ...v.physiology.Swim } };
      touch(s, 'intervals');
    },
    // Le mode démo n'a pas de jeton : toutes les écritures sont acceptées.
    async scope() {
      return 'ACTIVITY:READ WELLNESS:WRITE SETTINGS:WRITE CALENDAR:WRITE';
    },
    async saveIdentity(patch, by) {
      const s = ensure(athleteId);
      s.identity = { ...s.identity, ...patch };
      touch(s, by);
    },
    async savePhysiology(sport, patch, by) {
      const s = ensure(athleteId);
      s.physiology[sport] = { ...s.physiology[sport], ...patch };
      touch(s, by);
    },
    async saveVma(vmaKmh, by) {
      const s = ensure(athleteId);
      s.vmaKmh = vmaKmh;
      touch(s, by);
    },
    async setSync({ syncedAt, error }) {
      const s = ensure(athleteId);
      if (syncedAt) s.syncedAt = syncedAt;
      s.syncError = error;
    },
    async tests() {
      return [...(states.get(athleteId)?.tests ?? [])].sort((a, b) => (a.day === b.day ? b.createdAt.localeCompare(a.createdAt) : b.day.localeCompare(a.day)));
    },
    async addTest(t: NewTest, max: number) {
      const s = ensure(athleteId);
      if (s.tests.length >= max) return null;
      const row: TestRow = { id: randomUUID(), day: t.day, kind: t.kind, value: t.value, note: t.note, createdAt: new Date().toISOString() };
      s.tests.push(row);
      return row;
    },
    async deleteTest(testId) {
      const s = states.get(athleteId);
      if (!s) return false;
      const before = s.tests.length;
      s.tests = s.tests.filter((t) => t.id !== testId);
      return s.tests.length < before;
    },
  };
}
