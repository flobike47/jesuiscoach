import { zoneColor } from '@/lib/workout';
import { formatMinutes, formatMeters, type Block, type InnerBlock } from '@/lib/workoutBlocks';

/**
 * Résumé des blocs d'une séance en lignes lisibles :
 * regroupe les répétitions et calcule les cibles en watts.
 */

export interface WorkoutBlockSummary {
  label: string;
  target: string;
  zoneColor: string;
}

/**
 * Convertit une liste de blocs (depuis textToBlocks) en lignes de résumé :
 * - affiche les répétitions comme « 3×12 min »
 * - calcule les cibles en watts si FTP est fournie, sinon en %
 */
export function summarizeBlocks(blocks: Block[], ftp: number | null): WorkoutBlockSummary[] {
  if (blocks.length === 0) return [];

  const lines: WorkoutBlockSummary[] = [];

  for (const block of blocks) {
    if (block.kind === 'repeat') {
      // Bloc de répétition : « 3×12 min »
      const time = block.steps.reduce((s, x) => s + x.seconds, 0);
      const dist = block.steps.reduce((s, x) => s + x.meters, 0);
      const size = time ? formatMinutes(time) : dist ? formatMeters(dist) : '';
      const label = `${block.count} × ${size}`;

      // Cible du premier step (supposition simpliste)
      const firstStep = block.steps[0];
      if (firstStep) {
        const { targetFrom, targetTo } = getTargetRange(firstStep);
        const target = calculateTarget(targetFrom, targetTo, ftp);
        const color = getZoneColor(targetFrom, targetTo, firstStep.target);
        lines.push({ label, target, zoneColor: color });
      }
    } else {
      // Bloc simple (ramp ou step)
      const { targetFrom, targetTo } = getTargetRange(block);
      const size = block.meters ? formatMeters(block.meters) : formatMinutes(block.seconds);
      const label = `${block.title ? `${block.title} · ` : ''}${size}`;

      const target = calculateTarget(targetFrom, targetTo, ftp);
      const color = getZoneColor(targetFrom, targetTo, block.target);
      lines.push({ label, target, zoneColor: color });
    }
  }

  return lines;
}

/** Extrait les cibles min/max d'un bloc intérieur. */
function getTargetRange(block: InnerBlock): { targetFrom: number; targetTo: number } {
  if (block.kind === 'ramp') {
    return { targetFrom: block.from, targetTo: block.to };
  }
  return { targetFrom: block.low, targetTo: block.high };
}

/** Formate une cible en watts (si FTP fournie) ou en %. */
function calculateTarget(from: number, to: number, ftp: number | null): string {
  if (ftp != null) {
    const wFrom = Math.round((from / 100) * ftp);
    const wTo = Math.round((to / 100) * ftp);
    return formatWattRange(wFrom, wTo);
  }
  return formatPercentRange(Math.round(from), Math.round(to));
}

/** Choisit la couleur de zone (utilise le milieu du range). */
function getZoneColor(from: number, to: number, target: string): string {
  const midpoint = (from + to) / 2;
  // Conversion d'alias de cible vers TargetKind
  const kind = target === 'hr' ? 'hr' : target === 'pace' ? 'pace' : 'power';
  return zoneColor(midpoint, kind);
}

/** Formate une plage de watts (p. ex. 205–215 W). */
function formatWattRange(from: number, to: number): string {
  if (from === to) return `${from} W`;
  return `${from}–${to} W`;
}

/** Formate une plage de pourcentages (p. ex. « 88–93% »). */
function formatPercentRange(from: number, to: number): string {
  if (from === to) return `${from}%`;
  return `${from}–${to}%`;
}
