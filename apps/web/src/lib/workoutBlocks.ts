/**
 * Éditeur par blocs ⇄ format texte Intervals.icu (lib/workout.ts).
 *
 * Le texte reste la seule chose envoyée à Intervals.icu : l'éditeur lit le
 * texte en blocs, et réécrit le texte à chaque modification. Pur : sans DOM
 * ni React.
 *
 *   Bloc « palier »     → « - 10m 95-100% » (ou « - 10m 70% »)
 *   Bloc « rampe »      → « - 15m ramp 50-75% »
 *   Bloc « répétition » → « 3x » suivi de ses paliers, jusqu'à la ligne vide
 *
 * Un titre facultatif (« Échauffement ») précède le bloc.
 */

import { parseDuration } from './workout';

export interface StepBlock {
  kind: 'step';
  id: string;
  seconds: number;
  /** % FTP ; `high` > `low` pour une plage (« 95-100% »). */
  low: number;
  high: number;
}

export interface RampBlock {
  kind: 'ramp';
  id: string;
  seconds: number;
  from: number;
  to: number;
}

export type InnerBlock = StepBlock | RampBlock;

export interface RepeatBlock {
  kind: 'repeat';
  id: string;
  count: number;
  steps: InnerBlock[];
}

export type Block = (StepBlock | RampBlock | RepeatBlock) & { title?: string };

/** Bornes de l'éditeur (comme le parseur : 1 à 50 répétitions). */
export const LIMITS = {
  minSeconds: 5,
  maxSeconds: 6 * 3600,
  minPct: 20,
  maxPct: 300,
  minCount: 1,
  maxCount: 50,
} as const;

let seq = 0;
export const newId = () => `b${++seq}`;

const STEP_RE = /^-\s*(\S+)\s+(ramp\s+)?(\d{1,3})(?:-(\d{1,3}))?%$/i;
const REPEAT_RE = /^(\d{1,2})\s*x$/i;

/** 600 → « 10m », 225 → « 3m45s », 5400 → « 1h30m ». */
export function formatDurationToken(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}h` : ''}${m ? `${m}m` : ''}${r ? `${r}s` : ''}`;
}

function parseInner(line: string): InnerBlock | null {
  const m = STEP_RE.exec(line.trim());
  if (!m) return null;
  const seconds = parseDuration(m[1]);
  if (seconds == null || seconds === 0) return null;
  const a = Number(m[3]);
  const b = m[4] ? Number(m[4]) : a;
  if (m[2]) return { kind: 'ramp', id: newId(), seconds, from: a, to: b };
  return { kind: 'step', id: newId(), seconds, low: Math.min(a, b), high: Math.max(a, b) };
}

/**
 * Le texte est-il entièrement représentable en blocs ? Les options que
 * l'éditeur ne gère pas (cadence, zones « Z2 », cardio, « freeride »…) se
 * perdraient : ces séances restent en mode texte.
 */
export function isBlockEditable(text: string): boolean {
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || REPEAT_RE.test(line)) continue;
    if (line.startsWith('-')) {
      if (!parseInner(line)) return false;
    } else if (/\d+\s*(%|w|rpm|bpm)/i.test(line)) {
      // Une ligne qui ressemble à une consigne sans être un palier lisible.
      return false;
    }
  }
  return true;
}

/** Texte → blocs. Les lignes illisibles sont ignorées (voir isBlockEditable). */
export function textToBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let title: string | undefined;
  let repeat: RepeatBlock | null = null;
  const take = () => {
    const t = title;
    title = undefined;
    return t ? { title: t } : {};
  };
  const closeRepeat = () => {
    if (repeat && repeat.steps.length) blocks.push(repeat);
    repeat = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      closeRepeat();
      continue;
    }
    const rep = REPEAT_RE.exec(line);
    if (rep) {
      closeRepeat();
      repeat = { kind: 'repeat', id: newId(), count: clamp(Number(rep[1]), LIMITS.minCount, LIMITS.maxCount), steps: [], ...take() };
      continue;
    }
    if (line.startsWith('-')) {
      const inner = parseInner(line);
      if (!inner) continue;
      if (repeat) (repeat as RepeatBlock).steps.push(inner);
      else blocks.push({ ...inner, ...take() });
      continue;
    }
    // Titre de section : s'applique au prochain bloc.
    closeRepeat();
    title = line.slice(0, 60);
  }
  closeRepeat();
  return blocks;
}

function innerLine(b: InnerBlock): string {
  const d = formatDurationToken(b.seconds);
  if (b.kind === 'ramp') return `- ${d} ramp ${Math.round(b.from)}-${Math.round(b.to)}%`;
  return b.high > b.low ? `- ${d} ${Math.round(b.low)}-${Math.round(b.high)}%` : `- ${d} ${Math.round(b.low)}%`;
}

/** Blocs → texte : un paragraphe par bloc, séparés par une ligne vide. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      const head = b.title ? [b.title] : [];
      if (b.kind === 'repeat') return [...head, `${b.count}x`, ...b.steps.map(innerLine)].join('\n');
      return [...head, innerLine(b)].join('\n');
    })
    .join('\n\n');
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Pas d'un réglage de durée au toucher : fin pour les efforts courts,
 * large pour les longs (15 s → 30 s → 1 min → 5 min).
 */
export function durationStep(seconds: number, direction: 1 | -1): number {
  const base = direction > 0 ? seconds : seconds - 1;
  const step = base < 60 ? 15 : base < 5 * 60 ? 30 : base < 30 * 60 ? 60 : 5 * 60;
  return clamp(Math.round((seconds + direction * step) / step) * step, LIMITS.minSeconds, LIMITS.maxSeconds);
}

/** Déplace l'élément `index` d'un cran (−1 = vers le haut). */
export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function newBlock(kind: 'step' | 'ramp' | 'repeat'): Block {
  if (kind === 'step') return { kind, id: newId(), seconds: 10 * 60, low: 70, high: 70 };
  if (kind === 'ramp') return { kind, id: newId(), seconds: 10 * 60, from: 50, to: 75 };
  return {
    kind,
    id: newId(),
    count: 3,
    steps: [
      { kind: 'step', id: newId(), seconds: 5 * 60, low: 100, high: 100 },
      { kind: 'step', id: newId(), seconds: 3 * 60, low: 55, high: 55 },
    ],
  };
}
