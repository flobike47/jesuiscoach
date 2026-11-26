import { describe, it, expect } from 'vitest';
import { summarizeBlocks } from './workoutSummary';
import { textToBlocks } from './workoutBlocks';

describe('summarizeBlocks', () => {
  it('devrait regrouper les répétitions identiques', () => {
    // 3 blocs identiques de 12 min au sweet spot
    const blocks = textToBlocks('- 15m 50-75%\n\n3x\n- 12m 88-93%\n\n- 10m 50%');
    const summaries = summarizeBlocks(blocks, null);

    // Cherche le bloc des répétitions (devrait être le 2e)
    const repBlock = summaries.find((b) => b.label.includes('3 ×'));
    expect(repBlock).toBeDefined();
    expect(repBlock?.label).toMatch(/3\s*×\s*12\s*min/);
  });

  it('devrait calculer les cibles en watts quand FTP est fournie', () => {
    const blocks = textToBlocks('- 10m 90-100%');
    const summaries = summarizeBlocks(blocks, 250);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].target).toContain('W');
    // 90-100% de 250 = 225-250
    expect(summaries[0].target).toMatch(/225.*250/);
  });

  it('devrait utiliser les pourcentages si FTP est null', () => {
    const blocks = textToBlocks('- 10m 90-100%');
    const summaries = summarizeBlocks(blocks, null);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].target).toContain('%');
    expect(summaries[0].target).toMatch(/90.*100/);
  });

  it('devrait retourner un tableau vide pour une séance sans paliers', () => {
    const blocks = textToBlocks('');
    const summaries = summarizeBlocks(blocks, 250);
    expect(summaries).toEqual([]);
  });

  it('devrait afficher les blocs avec des cibles en watts', () => {
    const blocks = textToBlocks('- 5m 50-60%\n- 20m 95-110%\n- 10m 50%');
    const summaries = summarizeBlocks(blocks, 300);

    expect(summaries).toHaveLength(3);
    // Premier bloc : calme
    expect(summaries[0].target).toContain('W');
    // Deuxième bloc : dur
    expect(summaries[1].target).toContain('W');
    // Troisième bloc : calme
    expect(summaries[2].target).toContain('W');
  });
});
