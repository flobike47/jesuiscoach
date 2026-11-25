import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err: NodeJS.ErrnoException) => {
  // ioredis crie continuellement si Redis n'est pas up — on log une fois et on continue.
  // Les wrappers cached() retomberont en passthrough.
  if (err.code !== 'ECONNREFUSED') console.error('[redis]', err.message);
});

/** TTLs centralisés (secondes). Edits ici = un seul endroit à toucher. */
export const TTL = {
  // Données Intervals.icu : quota OAuth de 100 requêtes/utilisateur/jour,
  // on lit donc en priorité la copie locale et on ne rafraîchit qu'à ce rythme.
  athlete: 6 * 60 * 60,            // 6 h — profil, FTP, zones
  wellness: 30 * 60,               // 30 min — fitness / fatigue / forme
  activities: 10 * 60,             // 10 min — complété par les webhooks
  events: 10 * 60,                 // 10 min — calendrier
  streams: 30 * 24 * 60 * 60,      // 30 jours — une sortie ne change plus
  powerCurve: 6 * 60 * 60,         // 6 h
} as const;

/**
 * Cache JSON. Si Redis est down → on passe en passthrough (appelle fn directement).
 * Erreurs de désérialisation tombent en passthrough aussi (clé corrompue).
 */
export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const raw = await redis.get(key);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // valeur corrompue, on supprime et on régénère
        await redis.del(key);
      }
    }
  } catch {
    // Redis indisponible — on continue sans cache
  }

  const value = await fn();
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    /* swallow */
  }
  return value;
}

/**
 * Cache binaire (utilisé pour les chunks de TTS).
 */
export async function cachedBinary(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<Buffer>,
): Promise<Buffer> {
  try {
    const buf = await redis.getBuffer(key);
    if (buf && buf.length > 0) return buf;
  } catch {
    /* passthrough */
  }
  const value = await fn();
  try {
    await redis.setex(key, ttlSeconds, value);
  } catch {
    /* swallow */
  }
  return value;
}

/**
 * Supprime toutes les clés qui correspondent au motif (SCAN, jamais KEYS :
 * non bloquant). Redis indisponible → rien à invalider, on ignore.
 */
export async function invalidateKeys(pattern: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      if (keys.length) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  } catch {
    /* passthrough */
  }
}

/** Helper de hash stable pour des clés à partir d'entrées de longueur variable. */
export function hashKey(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}
