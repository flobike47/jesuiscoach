import { describe, it, expect } from 'vitest';
import { resistantPull, isPullTriggered, isAtPageTop } from './pull';

describe('pull', () => {
  describe('resistantPull', () => {
    it('retourne 0 pour un drag négatif', () => {
      expect(resistantPull(-10)).toBe(0);
    });

    it('retourne 0 pour un drag nul', () => {
      expect(resistantPull(0)).toBe(0);
    });

    it('applique la résistance progressive', () => {
      const small = resistantPull(50);
      const large = resistantPull(100);
      // small devrait être > 0, et large devrait être > small mais pas double
      expect(small).toBeGreaterThan(0);
      expect(large).toBeGreaterThan(small);
      expect(large).toBeLessThan(small * 2);
    });
  });

  describe('isPullTriggered', () => {
    it('retourne false pour une position < seuil', () => {
      expect(isPullTriggered(50)).toBe(false);
      expect(isPullTriggered(63)).toBe(false);
    });

    it('retourne true pour une position >= seuil', () => {
      expect(isPullTriggered(64)).toBe(true);
      expect(isPullTriggered(100)).toBe(true);
    });
  });

  describe('isAtPageTop', () => {
    it('retourne false pour un élément null', () => {
      expect(isAtPageTop(null)).toBe(false);
    });

    it('retourne true quand scrollTop est 0', () => {
      const el = document.createElement('div');
      el.scrollTop = 0;
      expect(isAtPageTop(el)).toBe(true);
    });

    it('retourne false quand scrollTop > 0', () => {
      const el = document.createElement('div');
      el.scrollTop = 10;
      expect(isAtPageTop(el)).toBe(false);
    });

    it('retourne true quand scrollTop est légèrement négatif (scroll au-delà du top)', () => {
      const el = document.createElement('div');
      el.scrollTop = -5;
      expect(isAtPageTop(el)).toBe(true);
    });
  });
});
