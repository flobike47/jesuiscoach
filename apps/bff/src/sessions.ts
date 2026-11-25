import { createHash } from 'node:crypto';
import { config } from './config.js';
import { redis } from './cache.js';
import { randomToken } from './lib/crypto.js';
import { deleteSession, deleteSessionsOf, insertSession, userOfSession, type UserRow } from './db/repo.js';

/**
 * Sessions de l'app : jeton opaque aléatoire (256 bits) envoyé par le web en
 * `Authorization: Bearer`. En base, seul son SHA-256 est stocké : une fuite
 * de la base ne donne pas de session utilisable. Révocable (déconnexion).
 */

const CACHE_TTL = 5 * 60;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  await insertSession(hashToken(token), userId, expires, userAgent?.slice(0, 512) || null);
  return token;
}

/** Utilisateur de la session, mis en cache 5 min dans Redis (une requête SQL de moins par appel). */
export async function resolveSession(token: string): Promise<UserRow | null> {
  const hash = hashToken(token);
  const key = `session:${hash}`;
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as UserRow;
  } catch {
    /* Redis indisponible : lecture directe */
  }
  const user = await userOfSession(hash);
  if (user) {
    try {
      await redis.setex(key, CACHE_TTL, JSON.stringify(user));
    } catch {
      /* swallow */
    }
  }
  return user;
}

export async function revokeSession(token: string): Promise<void> {
  const hash = hashToken(token);
  await deleteSession(hash);
  try {
    await redis.del(`session:${hash}`);
  } catch {
    /* le cache expire seul en 5 min */
  }
}

/**
 * Révoque toutes les sessions d'un utilisateur (suppression de compte), cache
 * compris : sinon une session resterait valide jusqu'à 5 min.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  const hashes = await deleteSessionsOf(userId);
  if (hashes.length === 0) return;
  try {
    await redis.del(...hashes.map((h) => `session:${h}`));
  } catch {
    /* le cache expire seul en 5 min */
  }
}
