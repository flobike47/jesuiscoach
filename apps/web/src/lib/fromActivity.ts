import type { IntervalView } from '@/types';

/** Écart de durée (s) et d'intensité (%) sous lesquels deux efforts sont « les mêmes ». */
const SAME_DURATION = 0.15;
const SAME_PCT = 4;
/** Effort retenu : au moins 30 s et 75 % de la FTP. */
const MIN_SECONDS = 30;
const MIN_PCT = 75;

const minutes = (secs: number) => {
  const s = Math.max(15, Math.round(secs / 15) * 15);
  return s % 60 === 0 ? `${s / 60}m` : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
};

interface Effort {
  seconds: number;
  pct: number;
  /** Récupération jusqu'à l'effort suivant (s). */
  rest: number;
}

/**
 * Reprend les intervalles d'une sortie réussie en séance au format
 * Intervals.icu : échauffement jusqu'au premier effort, efforts en % de la
 * FTP (les efforts semblables à la suite deviennent une répétition), récup
 * à 55 %, retour au calme. null si la sortie n'a pas d'effort exploitable.
 */
export function workoutFromIntervals(intervals: IntervalView[], ftp: number | null): string | null {
  if (!ftp) return null;
  const work = intervals
    .filter((iv) => iv.watts != null && iv.duration >= MIN_SECONDS && (iv.watts / ftp) * 100 >= MIN_PCT)
    .sort((a, b) => a.start - b.start);
  if (work.length === 0) return null;

  const efforts: Effort[] = work.map((iv, i) => ({
    seconds: iv.duration,
    pct: Math.round((iv.watts! / ftp) * 100),
    rest: i + 1 < work.length ? Math.max(0, work[i + 1].start - iv.end) : 0,
  }));

  const lines: string[] = ['Échauffement', `- ${minutes(Math.min(1200, Math.max(600, work[0].start)))} ramp 50-75%`, ''];
  for (let i = 0; i < efforts.length; ) {
    // Regroupe les efforts semblables qui se suivent.
    let n = 1;
    const e = efforts[i];
    while (
      i + n < efforts.length &&
      Math.abs(efforts[i + n].seconds - e.seconds) <= e.seconds * SAME_DURATION &&
      Math.abs(efforts[i + n].pct - e.pct) <= SAME_PCT
    )
      n++;
    const group = efforts.slice(i, i + n);
    const secs = group.reduce((s, x) => s + x.seconds, 0) / n;
    const pct = Math.round(group.reduce((s, x) => s + x.pct, 0) / n);
    const rests = group.slice(0, -1).map((x) => x.rest);
    const rest = rests.length ? rests.reduce((s, x) => s + x, 0) / rests.length : 0;
    if (n > 1) {
      lines.push(`${n}x`, `- ${minutes(secs)} ${pct}%`);
      if (rest >= 30) lines.push(`- ${minutes(rest)} 55%`);
    } else {
      lines.push(`- ${minutes(secs)} ${pct}%`);
    }
    const after = group[group.length - 1].rest;
    if (i + n < efforts.length && after >= 30) lines.push(`- ${minutes(after)} 55%`);
    lines.push('');
    i += n;
  }
  lines.push('Retour au calme', '- 10m 50%');
  return lines.join('\n');
}
