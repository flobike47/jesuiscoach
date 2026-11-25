/**
 * Éditeur par blocs ⇄ format texte Intervals.icu (lib/workout.ts).
 *
 * Le texte reste la seule chose envoyée à Intervals.icu : l'éditeur lit le
 * texte en blocs, et réécrit le texte à chaque modification. Pur : sans DOM
 * ni React.
 *
 *   Bloc « palier »     → « - 10m 95-100% 90rpm », « - 400mtr 105% Pace », « - 20m 85% LTHR »
 *   Bloc « rampe »      → « - 15m ramp 50-75% »
 *   Bloc « répétition » → « 3x » suivi de ses paliers, jusqu'à la ligne vide
 *
 * Un titre facultatif (« Échauffement ») précède le bloc.
 */

import { parseDistance, parseDuration, type Sport } from './workout';

/** Cibles proposées par l'éditeur (le % de FC max reste en mode texte). */
export type BlockTarget = 'power' | 'hr' | 'pace';

export interface Cadence {
  low: number;
  high: number;
}

interface Size {
  /** Durée en secondes, ou 0 si le palier est en distance. */
  seconds: number;
  /** Distance en mètres, ou 0 si le palier est en durée. */
  meters: number;
  target: BlockTarget;
  /** Vélo seulement. */
  cadence?: Cadence;
}

export interface StepBlock extends Size {
  kind: 'step';
  id: string;
  /** % de la cible ; `high` > `low` pour une plage (« 95-100% »). */
  low: number;
  high: number;
}

export interface RampBlock extends Size {
  kind: 'ramp';
  id: string;
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
  minMeters: 25,
  maxMeters: 50_000,
  minPct: 20,
  maxPct: 300,
  minCount: 1,
  maxCount: 50,
  minRpm: 30,
  maxRpm: 150,
} as const;

/** Plage des curseurs selon la cible (au-delà : mode texte). */
export const PCT_RANGE: Record<BlockTarget, { min: number; max: number; unit: string }> = {
  power: { min: 40, max: 200, unit: '% FTP' },
  hr: { min: 50, max: 110, unit: '% FC seuil' },
  pace: { min: 40, max: 130, unit: '% allure seuil' },
};

/** Cibles possibles et cible par défaut de chaque sport. */
export const SPORT_TARGETS: Record<Sport, BlockTarget[]> = { Ride: ['power', 'hr'], Run: ['pace', 'hr'], Swim: ['pace', 'hr'] };
export const DEFAULT_TARGET: Record<Sport, BlockTarget> = { Ride: 'power', Run: 'hr', Swim: 'pace' };

let seq = 0;
export const newId = () => `b${++seq}`;

const REPEAT_RE = /^(\d{1,2})\s*x$/i;
const PCT_RE = /^(\d{1,3})(?:-(\d{1,3}))?%$/;
const RPM_RE = /^(\d{2,3})(?:-(\d{2,3}))?rpm$/i;
const UNITS: Record<string, BlockTarget> = { lthr: 'hr', pace: 'pace' };
const SUFFIX: Record<BlockTarget, string> = { power: '', hr: ' LTHR', pace: ' Pace' };

/** 600 → « 10m », 225 → « 3m45s », 5400 → « 1h30m ». */
export function formatDurationToken(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}h` : ''}${m ? `${m}m` : ''}${r ? `${r}s` : ''}`;
}

/** 400 → « 400mtr », 2000 → « 2km », 1500 → « 1.5km » (natation : toujours en mètres). */
export function formatDistanceToken(meters: number, sport: Sport = 'Run'): string {
  const m = Math.max(1, Math.round(meters));
  if (sport !== 'Swim' && m >= 1000 && m % 100 === 0) return `${m / 1000}km`;
  return `${m}mtr`;
}

/**
 * Lit un palier « - <durée|distance> [ramp] <n%|a-b%> [LTHR|Pace] [cadence] ».
 * Tous les mots doivent être compris, sinon null (la séance reste en mode texte).
 */
function parseInner(line: string): InnerBlock | null {
  const t = line.trim();
  if (!t.startsWith('-')) return null;
  const tokens = t.slice(1).trim().split(/\s+/);
  // « 90 rpm » écrit en deux mots → un seul.
  const rpmAt = tokens.findIndex((x) => x.toLowerCase() === 'rpm');
  if (rpmAt > 0) tokens.splice(rpmAt - 1, 2, `${tokens[rpmAt - 1]}rpm`);

  let i = 0;
  const seconds = parseDuration(tokens[i] ?? '');
  const meters = seconds == null ? parseDistance(tokens[i] ?? '') : null;
  if ((seconds == null || seconds === 0) && (meters == null || meters === 0)) return null;
  i++;
  const ramp = tokens[i]?.toLowerCase() === 'ramp';
  if (ramp) i++;
  const pct = PCT_RE.exec(tokens[i] ?? '');
  if (!pct) return null;
  i++;
  let target: BlockTarget = 'power';
  const unit = UNITS[(tokens[i] ?? '').toLowerCase()];
  if (unit) {
    target = unit;
    i++;
  }
  let cadence: Cadence | undefined;
  const rpm = RPM_RE.exec(tokens[i] ?? '');
  if (rpm) {
    const lo = Number(rpm[1]);
    const hi = rpm[2] ? Number(rpm[2]) : lo;
    cadence = { low: Math.min(lo, hi), high: Math.max(lo, hi) };
    i++;
  }
  if (i !== tokens.length) return null;

  const size: Size = { seconds: seconds ?? 0, meters: meters ?? 0, target, ...(cadence ? { cadence } : {}) };
  const a = Number(pct[1]);
  const b = pct[2] ? Number(pct[2]) : a;
  if (ramp) return { kind: 'ramp', id: newId(), ...size, from: a, to: b };
  return { kind: 'step', id: newId(), ...size, low: Math.min(a, b), high: Math.max(a, b) };
}

/**
 * Le texte est-il entièrement représentable en blocs ? Les options que
 * l'éditeur ne gère pas (zones « Z2 », watts, % FC max, « freeride »,
 * consignes en texte…) se perdraient : ces séances restent en mode texte.
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

function innerLine(b: InnerBlock, sport: Sport): string {
  const size = b.meters ? formatDistanceToken(b.meters, sport) : formatDurationToken(b.seconds);
  const pct =
    b.kind === 'ramp'
      ? `ramp ${Math.round(b.from)}-${Math.round(b.to)}%`
      : b.high > b.low
        ? `${Math.round(b.low)}-${Math.round(b.high)}%`
        : `${Math.round(b.low)}%`;
  const cad = b.cadence ? ` ${b.cadence.high > b.cadence.low ? `${b.cadence.low}-${b.cadence.high}` : b.cadence.low}rpm` : '';
  return `- ${size} ${pct}${SUFFIX[b.target]}${cad}`;
}

/** Blocs → texte : un paragraphe par bloc, séparés par une ligne vide. */
export function blocksToText(blocks: Block[], sport: Sport = 'Ride'): string {
  return blocks
    .map((b) => {
      const head = b.title ? [b.title] : [];
      if (b.kind === 'repeat') return [...head, `${b.count}x`, ...b.steps.map((s) => innerLine(s, sport))].join('\n');
      return [...head, innerLine(b, sport)].join('\n');
    })
    .join('\n\n');
}

/**
 * Équivalence approximative entre cibles, pour garder la même intensité quand
 * on change de cible : % FTP ≈ % allure seuil, et % FC seuil ≈ 60 + 0,35 × % FTP
 * (100 % FTP ≈ 95 % FC seuil, 55 % ≈ 79 %).
 */
export function convertPct(pct: number, from: BlockTarget, to: BlockTarget): number {
  if (from === to) return pct;
  const effort = from === 'hr' ? (pct - 60) / 0.35 : pct;
  const value = to === 'hr' ? 60 + 0.35 * effort : effort;
  return clamp(Math.round(value), PCT_RANGE[to].min, Math.max(PCT_RANGE[to].max, Math.round(value)));
}

/** Change la cible d'un palier en gardant une intensité comparable. */
export function retarget<T extends InnerBlock>(b: T, target: BlockTarget): T {
  if (b.target === target) return b;
  const c = (v: number) => convertPct(v, b.target, target);
  return (b.kind === 'ramp' ? { ...b, target, from: c(b.from), to: c(b.to) } : { ...b, target, low: c(b.low), high: c(b.high) }) as T;
}

/**
 * Adapte les blocs à un autre sport : cible remplacée si le sport ne la gère
 * pas (puissance ↔ allure, valeurs converties), cadence retirée hors vélo,
 * distances converties en durée pour le vélo (≈ 20 s pour 100 m, arrondi à 30 s).
 */
export function convertBlocks(blocks: Block[], sport: Sport): Block[] {
  const inner = <T extends InnerBlock>(b: T): T => {
    const target = SPORT_TARGETS[sport].includes(b.target) ? b.target : DEFAULT_TARGET[sport];
    const next = { ...retarget(b, target) } as T;
    if (sport !== 'Ride') delete next.cadence;
    if (sport === 'Ride' && b.meters) {
      next.seconds = clamp(Math.round((b.meters * 0.2) / 30) * 30, 30, LIMITS.maxSeconds);
      next.meters = 0;
    }
    return next;
  };
  return blocks.map((b) => (b.kind === 'repeat' ? { ...b, steps: b.steps.map(inner) } : { ...inner(b), ...(b.title ? { title: b.title } : {}) }));
}

/**
 * Adapte le texte d'une séance à un autre sport, s'il est lisible en blocs ;
 * sinon le texte reste tel quel (l'utilisateur l'ajuste en mode texte).
 */
export function convertForSport(text: string, sport: Sport): string {
  if (!isBlockEditable(text)) return text;
  return blocksToText(convertBlocks(textToBlocks(text), sport), sport);
}

/** 600 → « 10 min », 225 → « 3 min 45 s », 5400 → « 1 h 30 » (affichage). */
export function formatMinutes(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  if (m) return s ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** 400 → « 400 m », 1500 → « 1,5 km » (affichage). */
export function formatMeters(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km` : `${meters} m`;
}

/** Taille d'un palier pour l'affichage : « 10 min » ou « 400 m ». */
export const formatSize = (b: { seconds: number; meters: number }) => (b.meters ? formatMeters(b.meters) : formatMinutes(b.seconds));

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Raccourcis du choix de durée et de distance. */
export const DURATION_PRESETS = [30, 60, 3 * 60, 5 * 60, 10 * 60, 20 * 60, 30 * 60, 60 * 60];
export const DISTANCE_PRESETS: Record<Sport, number[]> = { Ride: [], Run: [200, 400, 800, 1000, 2000, 5000], Swim: [25, 50, 100, 200, 400, 800] };

/** Déplace l'élément `index` d'un cran (−1 = vers le haut). */
export function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Nouveau bloc adapté au sport : vélo en puissance, course au cardio, natation à l'allure et en distance. */
export function newBlock(kind: 'step' | 'ramp' | 'repeat', sport: Sport = 'Ride'): Block {
  const target = DEFAULT_TARGET[sport];
  const base = (pct: number) => (target === 'power' ? pct : target === 'hr' ? Math.round(60 + pct * 0.35) : pct);
  const size = (seconds: number, swimMeters: number): Pick<Size, 'seconds' | 'meters' | 'target'> =>
    sport === 'Swim' ? { seconds: 0, meters: swimMeters, target } : { seconds, meters: 0, target };
  if (kind === 'step') return { kind, id: newId(), ...size(10 * 60, 200), low: base(70), high: base(70) };
  if (kind === 'ramp') return { kind, id: newId(), ...size(10 * 60, 200), from: base(50), to: base(75) };
  return {
    kind,
    id: newId(),
    count: 3,
    steps: [
      { kind: 'step', id: newId(), ...size(5 * 60, 100), low: base(100), high: base(100) },
      { kind: 'step', id: newId(), ...(sport === 'Swim' ? { seconds: 20, meters: 0, target } : size(3 * 60, 0)), low: base(55), high: base(55) },
    ],
  };
}
