import { config } from './config.js';
import { dbCareStore, type CareStore } from './db/careRepo.js';
import { findUserByAthlete } from './db/repo.js';
import { demoCareStore } from './demoCare.js';
import { demoSource } from './sources.js';
import { NotFound } from './validation.js';

/** Fiche « disponibilités, matériel, santé » d'un athlète : Postgres, ou mémoire en démo. */
export async function careStoreFor(athleteId: string): Promise<{ store: CareStore; name: string }> {
  if (config.demoMode) {
    const info = await demoSource().athlete(athleteId);
    return { store: demoCareStore(athleteId), name: info.name ?? athleteId };
  }
  const user = await findUserByAthlete(athleteId);
  if (!user) throw new NotFound('Athlète introuvable');
  return { store: dbCareStore(user.id), name: user.name };
}
