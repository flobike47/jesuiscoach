import { config } from './config.js';
import { findUserByAthlete } from './db/repo.js';
import { setWeightShared, weightSharedSince } from './db/sharingRepo.js';

/**
 * Partage de la courbe du poids avec le coach : Postgres pour les vrais
 * comptes, mémoire en démo (les athlètes démo n'existent pas en base).
 * Lu à chaque requête : un retrait prend effet immédiatement.
 */

/** Démo : la moitié de l'équipe partage déjà (pour montrer les deux cas), pas Julie (démo athlète). */
const demoShared = new Map<string, string | null>();
const demoDefault = (athleteId: string): string | null => {
  const k = Number(athleteId.replace('demo-', ''));
  return Number.isInteger(k) && k % 2 === 0 ? '2026-01-05T08:00:00.000Z' : null;
};

/** Date du partage, ou null si l'athlète ne partage pas (ou n'a pas de compte). */
export async function weightSharing(athleteId: string): Promise<string | null> {
  if (config.demoMode) return demoShared.has(athleteId) ? (demoShared.get(athleteId) ?? null) : demoDefault(athleteId);
  const user = await findUserByAthlete(athleteId);
  if (!user) return null;
  return weightSharedSince(user.id);
}

/** Choix de l'athlète connecté (identité issue de la session, jamais d'un paramètre). */
export async function saveWeightSharing(me: { id: string; athleteId: string }, shared: boolean): Promise<string | null> {
  if (config.demoMode) {
    const prev = await weightSharing(me.athleteId);
    const next = shared ? (prev ?? new Date().toISOString()) : null;
    demoShared.set(me.athleteId, next);
    return next;
  }
  return setWeightShared(me.id, shared);
}
