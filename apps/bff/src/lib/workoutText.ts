/**
 * Lecteur de séances au format texte Intervals.icu, côté serveur : port de
 * `apps/web/src/lib/workout.ts` et `workoutBlocks.ts` (même syntaxe, mêmes cas).
 * Sert à convertir une séance de l'app en plan Wahoo (wahooPlan.ts).
 *
 *   Échauffement                 ← titre de section, s'applique au bloc suivant
 *   - 15m ramp 50-75%            ← palier : durée ou distance, rampe, cible, cadence
 *
 *   3x                           ← répétition des paliers qui suivent,
 *   - 10m 95-100% 90rpm            jusqu'à la prochaine ligne vide
 *   - 5m 55%
 *
 * Cibles : « 70% » = % FTP, « 85% LTHR » = % FC seuil, « 80% Pace » = % allure
 * seuil, « 70% HR » = % FC max (lu, mais non converti pour les appareils).
 * Une ligne qui ne se lit pas (Z2, watts, consigne libre) va dans `unsupported`.
 *
 * Pur : sans base de données ni réseau.
 */

export type WorkoutSport = 'Ride' | 'Run' | 'Swim';
export type Target = 'power' | 'hr' | 'hrmax' | 'pace';

export interface Cadence {
  low: number;
  high: number;
}

interface Size {
  /** Durée en secondes, 0 si le palier est en distance. */
  seconds: number;
  /** Distance en mètres, 0 si le palier est en durée. */
  meters: number;
  target: Target;
  cadence?: Cadence;
  title?: string;
}

export interface StepBlock extends Size {
  kind: 'step';
  /** % de la cible ; `high` ≥ `low` (plage « 95-100% »). */
  low: number;
  high: number;
}

export interface RampBlock extends Size {
  kind: 'ramp';
  from: number;
  to: number;
}

export interface RepeatBlock {
  kind: 'repeat';
  count: number;
  steps: Array<StepBlock | RampBlock>;
  title?: string;
}

export type WorkoutBlock = StepBlock | RampBlock | RepeatBlock;

export interface ParsedWorkout {
  blocks: WorkoutBlock[];
  /** Lignes que le lecteur ne comprend pas : la séance ne peut pas être convertie fidèlement. */
  unsupported: string[];
}

const DURATION_RE = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
const DISTANCE_RE = /^(\d+(?:\.\d+)?)(km|mtr|mi|y)$/i;
const PCT_RE = /^(\d{1,3})(?:-(\d{1,3}))?%$/;
const REPEAT_RE = /^(\d{1,2})\s*x$/i;
const RPM_RE = /^(\d{2,3})(?:-(\d{2,3}))?rpm$/i;
const UNITS: Record<string, Target> = { lthr: 'hr', hr: 'hrmax', pace: 'pace' };
const METERS: Record<string, number> = { km: 1000, mtr: 1, mi: 1609.344, y: 0.9144 };
/** Même garde que le lecteur web : une ligne qui ressemble à une consigne sans être un palier. */
const CONSIGNE_RE = /\d+\s*(%|w|rpm|bpm)/i;
const MAX_REPEAT = 50;
const MAX_TITLE = 60;

export function parseDuration(token: string): number | null {
  const m = DURATION_RE.exec(token);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** « 400mtr » → 400, « 1.5km » → 1500, « 100y » → 91 ; null si ce n'est pas une distance. */
export function parseDistance(token: string): number | null {
  const m = DISTANCE_RE.exec(token);
  if (!m) return null;
  return Math.round(Number(m[1]) * METERS[m[2].toLowerCase()]);
}

/** Lit une ligne de palier « - <durée|distance> [ramp] <n%|a-b%> [LTHR|Pace|HR] [cadence] ». Null si illisible. */
export function parseStepLine(line: string): StepBlock | RampBlock | null {
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
  let target: Target = 'power';
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
  if (ramp) return { kind: 'ramp', ...size, from: a, to: b };
  return { kind: 'step', ...size, low: Math.min(a, b), high: Math.max(a, b) };
}

/** Lit une séance entière. Les lignes non comprises sont listées dans `unsupported`. */
export function parseWorkoutText(text: string): ParsedWorkout {
  const blocks: WorkoutBlock[] = [];
  const unsupported: string[] = [];
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
      repeat = { kind: 'repeat', count: Math.max(1, Math.min(MAX_REPEAT, Number(rep[1]))), steps: [], ...take() };
      continue;
    }
    if (line.startsWith('-')) {
      const step = parseStepLine(line);
      if (!step) {
        unsupported.push(line);
        continue;
      }
      if (repeat) repeat.steps.push(step);
      else blocks.push({ ...step, ...take() });
      continue;
    }
    if (CONSIGNE_RE.test(line)) {
      unsupported.push(line);
      continue;
    }
    // Titre de section : s'applique au prochain bloc.
    closeRepeat();
    title = line.slice(0, MAX_TITLE);
  }
  closeRepeat();
  return { blocks, unsupported };
}

/**
 * Durée estimée d'une séance, en secondes. Les paliers en durée sont exacts ;
 * les paliers en distance sont estimés (course ≈ 5 min/km, vélo ≈ 30 km/h).
 */
export function estimatedSeconds(blocks: WorkoutBlock[], sport: WorkoutSport): number {
  const perMeter = sport === 'Run' ? 0.3 : 0.12;
  const one = (s: StepBlock | RampBlock) => s.seconds || s.meters * perMeter;
  return blocks.reduce((total, b) => total + (b.kind === 'repeat' ? b.count * b.steps.reduce((t, s) => t + one(s), 0) : one(b)), 0);
}

/** Moyenne de x⁴ sur [a, b] (intensité variant linéairement). */
function meanFourth(a: number, b: number): number {
  if (Math.abs(b - a) < 1e-9) return a ** 4;
  return (b ** 5 - a ** 5) / (5 * (b - a));
}

/**
 * Charge estimée d'une séance, même méthode que le web (lib/workout.ts,
 * workoutStats) et qu'Intervals.icu : intensité = racine 4e de la moyenne
 * des intensités⁴ pondérées par la durée ; charge = heures × intensité² × 100.
 * Les paliers en distance ne comptent pas. 0 si rien de chronométré.
 */
export function estimatedLoad(blocks: WorkoutBlock[]): number {
  const { seconds, intensity } = timedIntensity(blocks);
  return Math.round((seconds / 3600) * intensity * intensity * 100);
}

/** Intensité estimée (1 = une heure au seuil), même méthode que la charge. 0 si rien de chronométré. */
export function estimatedIntensity(blocks: WorkoutBlock[]): number {
  return Math.round(timedIntensity(blocks).intensity * 100) / 100;
}

function timedIntensity(blocks: WorkoutBlock[]): { seconds: number; intensity: number } {
  let seconds = 0;
  let weighted = 0;
  const add = (s: StepBlock | RampBlock, times: number) => {
    if (!s.seconds) return;
    const [a, b] = s.kind === 'step' ? [s.low, s.high] : [s.from, s.to];
    seconds += s.seconds * times;
    weighted += s.seconds * times * meanFourth(a / 100, b / 100);
  };
  for (const b of blocks) {
    if (b.kind === 'repeat') b.steps.forEach((s) => add(s, b.count));
    else add(b, 1);
  }
  return { seconds, intensity: seconds ? (weighted / seconds) ** 0.25 : 0 };
}
