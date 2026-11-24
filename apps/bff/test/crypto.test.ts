import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, parseKey, pkcePair } from '../src/lib/crypto.js';

describe('chiffrement des jetons', () => {
  const key = randomBytes(32);

  it('fait un aller-retour et ne laisse pas le jeton en clair', () => {
    const enc = encrypt('jeton-secret', key);
    expect(enc).not.toContain('jeton-secret');
    expect(decrypt(enc, key)).toBe('jeton-secret');
  });

  it('utilise un IV différent à chaque chiffrement', () => {
    expect(encrypt('x', key)).not.toBe(encrypt('x', key));
  });

  it('refuse un chiffré altéré ou une autre clé', () => {
    const enc = Buffer.from(encrypt('jeton', key), 'base64');
    enc[enc.length - 1] ^= 1;
    expect(() => decrypt(enc.toString('base64'), key)).toThrow();
    expect(() => decrypt(encrypt('jeton', key), randomBytes(32))).toThrow();
  });

  it('exige une clé de 32 octets', () => {
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow();
    expect(parseKey(randomBytes(32).toString('base64'))).toHaveLength(32);
  });
});

describe('pkcePair', () => {
  it('produit un challenge S256 du verifier', () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});
