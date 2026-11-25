import { randomUUID } from 'node:crypto';
import { CARE_LIMITS, addDays, defaultDays, DEFAULT_EQUIPMENT, type AvailabilityException, type AvailabilityInput, type CareState, type Equipment, type ExceptionInput, type Injury, type InjuryInput } from './lib/care.js';
import type { Actor, CareStore } from './db/careRepo.js';

/**
 * Fiche « soin » du mode démo : données en mémoire (les comptes démo n'existent
 * pas en base). Scénario stable, relatif à aujourd'hui :
 *  - demo-1 (Julie) : lundi et vendredi indisponibles, mardi 60 min max ;
 *  - demo-2 (Paul) : blessé au genou, pas de course jusqu'à J+20 ;
 *  - demo-3 (Sarah) : pas de capteur de puissance ni de home trainer.
 */

const states = new Map<string, CareState>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function seed(athleteId: string): CareState {
  const t = today();
  const base: CareState = { weeklyMinutes: null, days: defaultDays(), exceptions: [], equipment: { ...DEFAULT_EQUIPMENT }, injuries: [], updatedBy: 'athlete', updatedAt: null };
  if (athleteId === 'demo-1') {
    base.weeklyMinutes = 480;
    base.days[0] = { ...base.days[0], available: false };
    base.days[4] = { ...base.days[4], available: false };
    base.days[1] = { ...base.days[1], maxMinutes: 60 };
    base.equipment = { ...base.equipment, hrStrap: true, powerMeter: true };
  }
  if (athleteId === 'demo-2') {
    base.injuries = [
      {
        id: '00000000-0000-4000-8000-0000000d2001',
        title: 'Tendinite au genou',
        startedOn: addDays(t, -10),
        expectedEnd: addDays(t, 20),
        endedOn: null,
        avoidSports: ['Run'],
        avoidIntensity: false,
        note: 'Pas de course pour l’instant, vélo doux accepté.',
      },
    ];
    base.equipment = { ...base.equipment, powerMeter: true };
  }
  if (athleteId === 'demo-3') {
    base.equipment = { ...base.equipment, hrStrap: true };
  }
  return base;
}

/** État courant d'un athlète démo (créé au premier accès). */
export function demoCareState(athleteId: string): CareState {
  let s = states.get(athleteId);
  if (!s) {
    s = seed(athleteId);
    states.set(athleteId, s);
  }
  return s;
}

/** Store démo : même interface que la base (`dbCareStore`), en mémoire. */
export function demoCareStore(athleteId: string): CareStore {
  const touch = (by: Actor) => {
    const s = demoCareState(athleteId);
    s.updatedBy = by;
    s.updatedAt = new Date().toISOString();
    return s;
  };

  return {
    async read() {
      return structuredClone(demoCareState(athleteId));
    },

    async replaceAvailability(input: AvailabilityInput, by: Actor) {
      const s = touch(by);
      s.weeklyMinutes = input.weeklyMinutes;
      s.days = structuredClone(input.days);
    },

    async setEquipment(eq: Equipment, by: Actor) {
      touch(by).equipment = { ...eq };
    },

    async addException(input: ExceptionInput, by: Actor): Promise<AvailabilityException | null> {
      const s = demoCareState(athleteId);
      if (s.exceptions.length >= CARE_LIMITS.maxExceptions) return null;
      const exception = { id: randomUUID(), ...input };
      touch(by).exceptions = [...s.exceptions, exception].sort((a, b) => a.fromDay.localeCompare(b.fromDay));
      return exception;
    },

    async deleteException(id: string, by: Actor) {
      const s = demoCareState(athleteId);
      if (!s.exceptions.some((e) => e.id === id)) return false;
      touch(by).exceptions = s.exceptions.filter((e) => e.id !== id);
      return true;
    },

    async addInjury(input: InjuryInput, by: Actor): Promise<Injury | null> {
      const s = demoCareState(athleteId);
      if (s.injuries.length >= CARE_LIMITS.maxInjuries) return null;
      const injury = { id: randomUUID(), ...input };
      touch(by).injuries = [injury, ...s.injuries];
      return injury;
    },

    async updateInjury(id: string, input: InjuryInput, by: Actor): Promise<Injury | null> {
      const s = demoCareState(athleteId);
      if (!s.injuries.some((i) => i.id === id)) return null;
      const injury = { id, ...input };
      touch(by).injuries = s.injuries.map((i) => (i.id === id ? injury : i));
      return injury;
    },

    async deleteInjury(id: string, by: Actor) {
      const s = demoCareState(athleteId);
      if (!s.injuries.some((i) => i.id === id)) return false;
      touch(by).injuries = s.injuries.filter((i) => i.id !== id);
      return true;
    },
  };
}
