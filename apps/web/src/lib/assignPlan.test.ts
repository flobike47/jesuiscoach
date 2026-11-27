import { describe, it, expect } from 'vitest';
import { scaleTargets, groupForSending, type Suggestion } from './assignPlan';

describe('assignPlan', () => {
  describe('scaleTargets', () => {
    it('multiplie les pourcentages simples', () => {
      const text = '- 20m 95%';
      const result = scaleTargets(text, 0.95);
      expect(result).toBe('- 20m 90%');
    });

    it('multiplie les plages de pourcentages', () => {
      const text = '- 12m 88-93%';
      const result = scaleTargets(text, 0.95);
      expect(result).toBe('- 12m 84-88%');
    });

    it('arrondit à l\'entier le plus proche', () => {
      const text = '- 10m 100%';
      const result = scaleTargets(text, 0.75);
      expect(result).toBe('- 10m 75%');
    });

    it('gère les rampes', () => {
      const text = '- 15m ramp 50-75%';
      const result = scaleTargets(text, 1.1);
      expect(result).toBe('- 15m ramp 55-83%');
    });

    it('ignore les lignes sans pourcentage', () => {
      const text = 'Échauffement\n- 15m ramp 50-75%\n\n2x\n- 10m 50%';
      const result = scaleTargets(text, 0.9);
      expect(result).toContain('Échauffement');
      expect(result).toContain('2x');
      expect(result).toContain('- 15m ramp 45-68%');
      expect(result).toContain('- 10m 45%');
    });

    it('retourne le texte inchangé avec facteur 1', () => {
      const text = '- 20m 95%\n- 10m 50%';
      const result = scaleTargets(text, 1);
      expect(result).toBe(text);
    });

    it('gère les pourcentages élevés (> 100%)', () => {
      const text = '- 10m 95-110%';
      const result = scaleTargets(text, 0.9);
      expect(result).toBe('- 10m 86-99%');
    });

    it('préserve l\'indentation', () => {
      const text = '  - 10m 50%';
      const result = scaleTargets(text, 0.9);
      expect(result).toBe('  - 10m 45%');
    });

    it('multiplie une séance complète', () => {
      const text = `Échauffement
- 15m ramp 50-75%

2x
- 20m 95%
- 5m 55%

Retour au calme
- 10m 50%`;

      const result = scaleTargets(text, 0.95);

      expect(result).toContain('Échauffement'); // titre inchangé
      expect(result).toContain('2x'); // répétitions inchangées
      expect(result).toContain('- 15m ramp 48-71%');
      expect(result).toContain('- 20m 90%');
      expect(result).toContain('- 5m 52%');
      expect(result).toContain('- 10m 48%');
      expect(result).toContain('Retour au calme'); // titre inchangé
    });
  });

  describe('groupForSending', () => {
    const mockVariantOf = (text: string, variant: 'courte' | 'standard' | 'longue') => {
      if (variant === 'courte') return text.replace(/2x/, '1x').replace(/20m/, '15m');
      if (variant === 'longue') return text.replace(/2x/, '3x');
      return text;
    };

    it('exclut les suggestions avec date: null', () => {
      const suggestions: Suggestion[] = [
        {
          athleteId: 'a1',
          name: 'Alice',
          date: '2026-11-30',
          variant: 'standard',
          intensityScale: 1,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
        {
          athleteId: 'a2',
          name: 'Bob',
          date: null,
          variant: 'standard',
          intensityScale: 1,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: 'Blessure',
        },
      ];

      const result = groupForSending(suggestions, '- 20m 95%', mockVariantOf);

      expect(result).toHaveLength(1);
      expect(result[0].athleteIds).toEqual(['a1']);
    });

    it('regroupe par (date, description)', () => {
      const baseDesc = '- 20m 95%';
      const suggestions: Suggestion[] = [
        {
          athleteId: 'a1',
          name: 'Alice',
          date: '2026-11-30',
          variant: 'standard',
          intensityScale: 1,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
        {
          athleteId: 'a2',
          name: 'Bob',
          date: '2026-11-30',
          variant: 'standard',
          intensityScale: 1,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
        {
          athleteId: 'a3',
          name: 'Charlie',
          date: '2026-12-01',
          variant: 'standard',
          intensityScale: 1,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
      ];

      const result = groupForSending(suggestions, baseDesc, mockVariantOf);

      expect(result).toHaveLength(2);
      expect(result[0].athleteIds.sort()).toEqual(['a1', 'a2']);
      expect(result[1].athleteIds).toEqual(['a3']);
    });

    it('applique les variantes', () => {
      const baseDesc = '- 20m 95%';
      const suggestions: Suggestion[] = [
        {
          athleteId: 'a1',
          name: 'Alice',
          date: '2026-11-30',
          variant: 'courte',
          intensityScale: 1,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
        {
          athleteId: 'a2',
          name: 'Bob',
          date: '2026-11-30',
          variant: 'standard',
          intensityScale: 1,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
      ];

      const result = groupForSending(suggestions, baseDesc, mockVariantOf);

      expect(result).toHaveLength(2);
      expect(result[0].variant).toBe('courte');
      expect(result[1].variant).toBe('standard');
    });

    it('applique scaleTargets si intensityScale ≠ 1', () => {
      const baseDesc = '- 20m 100%';
      const suggestions: Suggestion[] = [
        {
          athleteId: 'a1',
          name: 'Alice',
          date: '2026-11-30',
          variant: 'standard',
          intensityScale: 0.9,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
      ];

      const result = groupForSending(suggestions, baseDesc, mockVariantOf);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('- 20m 90%');
    });

    it('combine variante et intensityScale', () => {
      const baseDesc = '2x\n- 20m 100%\n- 5m 50%';
      const suggestions: Suggestion[] = [
        {
          athleteId: 'a1',
          name: 'Alice',
          date: '2026-11-30',
          variant: 'courte',
          intensityScale: 0.95,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
      ];

      const result = groupForSending(suggestions, baseDesc, mockVariantOf);

      expect(result).toHaveLength(1);
      // Variante courte : 2x → 1x, 20m → 15m
      // Puis scale 0.95 : 100% → 95%, 50% → 48% (arrondi)
      // Résultat: 1x\n- 15m 95%\n- 5m 48%
      const desc = result[0].description;
      expect(desc).toContain('1x');
      expect(desc).toContain('- 15m 95%');
      expect(desc).toContain('- 5m 48%');
    });

    it('compte correctement les athlètes avec même description mais variantes différentes', () => {
      const baseDesc = '- 20m 100%';
      const suggestions: Suggestion[] = [
        {
          athleteId: 'a1',
          name: 'Alice',
          date: '2026-11-30',
          variant: 'courte',
          intensityScale: 0.9,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
        {
          athleteId: 'a2',
          name: 'Bob',
          date: '2026-11-30',
          variant: 'courte',
          intensityScale: 0.9,
          reasons: [],
          alternatives: [],
          replaces: null,
          blocked: null,
        },
      ];

      const result = groupForSending(suggestions, baseDesc, mockVariantOf);

      // Après variante courte : "- 15m 100%"
      // Après scale 0.9 : "- 15m 90%"
      // Les deux ont la même description → 1 groupe avec 2 athlètes
      expect(result).toHaveLength(1);
      expect(result[0].athleteIds).toEqual(['a1', 'a2']);
    });
  });
});
