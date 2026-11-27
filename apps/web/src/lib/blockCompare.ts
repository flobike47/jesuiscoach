import type { Step } from './workout';
import type { IntervalView } from '@/types';

export interface BlockResult {
  /** Cible en watts [basse, haute]. */
  target: [number, number];
  /** Puissance moyenne réalisée sur l'intervalle apparié. */
  actual: number;
  ok: boolean;
}

/** Bloc de travail : palier en puissance d'au moins 85 % de la FTP. */
const WORK = 85;
/** Cible ponctuelle (« 95% ») : tolérance de ±3 %. */
const POINT_BAND = 0.03;
/** Écart de durée accepté entre un bloc prévu et un intervalle détecté. */
const DURATION_SLACK = 0.4;

/**
 * Prévu contre réalisé, bloc par bloc : chaque bloc de travail de la séance
 * est apparié, dans l'ordre, au premier intervalle détecté de durée voisine.
 * null si la comparaison n'a pas de sens (pas de FTP, pas de bloc en
 * puissance, aucun intervalle apparié).
 */
export function compareBlocks(steps: Step[], ftp: number | null, intervals: IntervalView[]): { blocks: BlockResult[]; summary: string } | null {
  if (!ftp) return null;
  const work = steps.filter((s) => s.target === 'power' && s.seconds > 0 && Math.max(s.from, s.to) >= WORK);
  const efforts = intervals.filter((iv) => iv.watts != null).sort((a, b) => a.start - b.start);
  if (work.length === 0 || efforts.length === 0) return null;

  const blocks: BlockResult[] = [];
  let next = 0;
  for (const step of work) {
    const idx = efforts.findIndex((iv, i) => i >= next && Math.abs(iv.duration - step.seconds) <= step.seconds * DURATION_SLACK);
    if (idx < 0) continue;
    next = idx + 1;
    const lo = Math.min(step.from, step.to);
    const hi = Math.max(step.from, step.to);
    const target: [number, number] =
      lo === hi ? [Math.round(lo * ftp * (1 - POINT_BAND) / 100), Math.round(hi * ftp * (1 + POINT_BAND) / 100)] : [Math.round((lo * ftp) / 100), Math.round((hi * ftp) / 100)];
    const actual = Math.round(efforts[idx].watts!);
    blocks.push({ target, actual, ok: actual >= target[0] && actual <= target[1] });
  }
  if (blocks.length === 0) return null;

  const ok = blocks.filter((b) => b.ok).length;
  const range = `${blocks[0].target[0]}–${blocks[0].target[1]} W`;
  const summary =
    ok === blocks.length
      ? `${blocks.length > 1 ? `Les ${blocks.length} blocs sont` : 'Le bloc est'} dans la cible (${range}).`
      : `${ok} bloc${ok > 1 ? 's' : ''} sur ${blocks.length} dans la cible (${range}) ; ${blocks.some((b) => b.actual > b.target[1]) ? 'parti trop fort' : 'en dessous'} sur ${blocks.length - ok}.`;
  return { blocks, summary };
}
