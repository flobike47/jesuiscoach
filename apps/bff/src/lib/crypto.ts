import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Chiffrement AES-256-GCM des jetons Intervals.icu stockés en base.
 * Format : base64(iv[12] | tag[16] | chiffré). La clé (32 octets, base64)
 * vient de TOKEN_ENCRYPTION_KEY et ne quitte jamais le BFF.
 */

export function parseKey(b64: string): Buffer {
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY doit faire 32 octets (base64)');
  return key;
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decrypt(payload: string, key: Buffer): string {
  const raw = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** Paire PKCE (RFC 7636, méthode S256 — la seule acceptée par Intervals.icu). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}
