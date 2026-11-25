/**
 * Format texte des séances Intervals.icu (le même que dans leur éditeur) :
 *
 *   Échauffement                 ← titre de section (ignoré pour le calcul)
 *   - 15m ramp 50-75%            ← palier : durée, (rampe), cible
 *
 *   3x                           ← répétition des paliers qui suivent,
 *   - 10m 95-100% 90rpm            jusqu'à la prochaine ligne vide
 *   - 5m 55%
 *
 * Durée (1h, 10m, 30s, 3m45s) ou distance (400mtr, 2km, 1.5km, 1mi, 100y).
 * « m » = minutes, « mtr » = mètres (règle d'Intervals.icu).
 * Cible : « 70% » = % FTP (vélo), « 85% LTHR » = % de la FC seuil,
 * « 80% Pace » = % de l'allure seuil (course, natation), « 70% HR » = % FC max.
 * Cadence facultative après la cible : « 90rpm », « 85-95rpm ».
 *
 * Pur : sans DOM ni React. Syntaxe vérifiée sur le guide Intervals.icu (2026).
 */

export type Sport = 'Ride' | 'Run' | 'Swim';
/** Cible d'un palier : puissance (% FTP), cardio (% FC seuil ou max), allure (% allure seuil). */
export type TargetKind = 'power' | 'hr' | 'hrmax' | 'pace';

export const SPORT_LABELS: Record<Sport, string> = { Ride: 'Vélo', Run: 'Course', Swim: 'Natation' };

export interface Step {
  /** Durée en secondes (0 si le palier est en distance). */
  seconds: number;
  /** Distance en mètres (0 si le palier est en durée). */
  meters: number;
  /** % de la référence au début et à la fin (égaux hors rampe). */
  from: number;
  to: number;
  target: TargetKind;
}

export interface WorkoutStats {
  /** Durée des paliers en durée (les paliers en distance dépendent de l'allure de chaque athlète). */
  seconds: number;
  /** Distance des paliers en distance. */
  meters: number;
  /** Charge estimée : intensité² × heures × 100 (comme Intervals.icu), sur les paliers en durée. */
  load: number;
  /** Intensité : moyenne « normalisée » des % de la cible, sur les paliers en durée. */
  intensity: number;
  /** false si des paliers sont en distance : durée et charge exactes calculées par Intervals.icu. */
  complete: boolean;
}

const DURATION_RE = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
const DISTANCE_RE = /^(\d+(?:\.\d+)?)(km|mtr|mi|y)$/i;
const PCT_RE = /^(\d{1,3})(?:-(\d{1,3}))?%$/;
const REPEAT_RE = /^(\d{1,2})\s*x$/i;
const UNIT_TARGET: Record<string, TargetKind> = { lthr: 'hr', hr: 'hrmax', pace: 'pace' };
const METERS: Record<string, number> = { km: 1000, mtr: 1, mi: 1609.344, y: 0.9144 };

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

/** Lit une ligne de palier « - 10m 95-100% » ; null si ce n'en est pas une. */
export function parseStep(line: string): Step | null {
  const t = line.trim();
  if (!t.startsWith('-')) return null;
  const tokens = t.slice(1).trim().split(/\s+/);
  const seconds = parseDuration(tokens[0] ?? '');
  const meters = seconds == null ? parseDistance(tokens[0] ?? '') : null;
  if (seconds == null && meters == null) return null;
  const ramp = tokens.some((x) => x.toLowerCase() === 'ramp');
  const at = tokens.findIndex((x) => PCT_RE.test(x));
  if (at < 0) return null;
  const pct = PCT_RE.exec(tokens[at])!;
  const target = UNIT_TARGET[(tokens[at + 1] ?? '').toLowerCase()] ?? 'power';
  const a = Number(pct[1]);
  const b = pct[2] ? Number(pct[2]) : a;
  const size = { seconds: seconds ?? 0, meters: meters ?? 0, target };
  // Plage simple (« 65-75% ») : on retient le milieu ; rampe : début → fin.
  return ramp ? { ...size, from: a, to: b } : { ...size, from: (a + b) / 2, to: (a + b) / 2 };
}

/** Déroule la séance en paliers successifs (répétitions développées). */
export function parseWorkout(text: string): Step[] {
  const steps: Step[] = [];
  let repeat = 1;
  let block: Step[] = [];
  const flush = () => {
    for (let i = 0; i < repeat; i++) steps.push(...block);
    block = [];
    repeat = 1;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const rep = REPEAT_RE.exec(line);
    if (rep) {
      flush();
      repeat = Math.max(1, Math.min(50, Number(rep[1])));
      continue;
    }
    const step = parseStep(line);
    if (step) block.push(step);
  }
  flush();
  return steps;
}

/** Moyenne de x⁴ sur une rampe linéaire de a à b (intégrale exacte). */
function meanFourth(a: number, b: number): number {
  if (Math.abs(b - a) < 1e-9) return a ** 4;
  return (b ** 5 - a ** 5) / (5 * (b - a));
}

/**
 * Durée, intensité et charge estimées, avec la même méthode qu'Intervals.icu
 * (vérifié au spike du 25/11/2026 : même séance → 39 min, intensité 0,78,
 * charge 40) : moyenne de l'intensité à la puissance 4, puis racine 4e — la
 * logique de la puissance normalisée, qui pèse davantage les efforts intenses.
 * Pour le cardio et l'allure, le % de la cible sert d'intensité (estimation).
 * Les paliers en distance ne comptent pas : leur durée dépend de l'athlète.
 */
export function workoutStats(steps: Step[]): WorkoutStats {
  let seconds = 0;
  let meters = 0;
  let weighted = 0;
  for (const s of steps) {
    meters += s.meters;
    if (!s.seconds) continue;
    seconds += s.seconds;
    weighted += s.seconds * meanFourth(s.from / 100, s.to / 100);
  }
  const hours = seconds / 3600;
  const intensity = seconds ? (weighted / seconds) ** 0.25 : 0;
  return {
    seconds,
    meters,
    load: Math.round(hours * intensity * intensity * 100),
    intensity: Math.round(intensity * 100) / 100,
    complete: meters === 0,
  };
}

/**
 * Durée approximative d'un palier en distance, pour le profil seulement
 * (course ≈ 5 min/km, natation ≈ 2 min/100 m au seuil, plus lent sous le seuil).
 */
export function approxSeconds(step: Step, sport: Sport): number {
  if (step.seconds) return step.seconds;
  const perMeter = sport === 'Swim' ? 1.2 : 0.3;
  const pct = Math.max(50, (step.from + step.to) / 2);
  return (step.meters * perMeter * 100) / (step.target === 'pace' ? pct : 85);
}

export interface WorkoutTemplate {
  name: string;
  description: string;
  sport?: Sport;
}

/** Bibliothèque par défaut : séances types par sport. */
export const TEMPLATES: Required<WorkoutTemplate>[] = [
  { sport: 'Ride', name: 'Endurance 2 h', description: 'Échauffement\n- 10m ramp 50-65%\n\nEndurance\n- 100m 65-75%\n\nRetour au calme\n- 10m 55%' },
  { sport: 'Ride', name: 'Sweet spot 3×12', description: 'Échauffement\n- 15m ramp 50-75%\n\n3x\n- 12m 88-93%\n- 5m 55%\n\nRetour au calme\n- 10m 50%' },
  { sport: 'Ride', name: 'Seuil 3×10', description: 'Échauffement\n- 15m ramp 50-75%\n\n3x\n- 10m 95-100%\n- 5m 55%\n\nRetour au calme\n- 10m 50%' },
  { sport: 'Ride', name: 'VO2max 5×4', description: 'Échauffement\n- 15m ramp 50-75%\n\n5x\n- 4m 110-120%\n- 4m 50%\n\nRetour au calme\n- 10m 50%' },
  { sport: 'Ride', name: 'Force 5×5 à 60 rpm', description: 'Échauffement\n- 15m ramp 50-75% 90rpm\n\n5x\n- 5m 85-90% 55-65rpm\n- 3m 55% 90rpm\n\nRetour au calme\n- 10m 50%' },
  { sport: 'Ride', name: 'Sprints 8×15 s', description: 'Échauffement\n- 20m ramp 50-70%\n\n8x\n- 15s 200%\n- 3m45s 55%\n\nRetour au calme\n- 15m 55%' },
  { sport: 'Ride', name: 'Récupération 45 min', description: '- 45m 45-55%' },
  { sport: 'Run', name: 'Footing 45 min', description: 'Échauffement\n- 10m 75-82% LTHR\n\nFooting\n- 30m 82-88% LTHR\n\nRetour au calme\n- 5m 75% LTHR' },
  { sport: 'Run', name: 'Seuil 3×8 min', description: 'Échauffement\n- 15m ramp 75-88% LTHR\n\n3x\n- 8m 97-100% Pace\n- 2m 70% Pace\n\nRetour au calme\n- 10m 75% LTHR' },
  { sport: 'Run', name: 'Fractionné 6×400 m', description: 'Échauffement\n- 15m 75-85% LTHR\n\n6x\n- 400mtr 105-108% Pace\n- 90s 60% Pace\n\nRetour au calme\n- 10m 75% LTHR' },
  { sport: 'Run', name: 'Sortie longue 1 h 30', description: '- 90m 80-87% LTHR' },
  { sport: 'Swim', name: 'Endurance 2 000 m', description: 'Échauffement\n- 300mtr 70% Pace\n\n5x\n- 300mtr 80-85% Pace\n- 30s 40% Pace\n\nRetour au calme\n- 200mtr 65% Pace' },
  { sport: 'Swim', name: 'Seuil 10×100 m', description: 'Échauffement\n- 400mtr 70% Pace\n\n10x\n- 100mtr 100% Pace\n- 20s 40% Pace\n\nRetour au calme\n- 200mtr 65% Pace' },
  { sport: 'Swim', name: 'Vitesse 8×50 m', description: 'Échauffement\n- 400mtr 70% Pace\n\n8x\n- 50mtr 110% Pace\n- 30s 40% Pace\n\nRetour au calme\n- 300mtr 65% Pace' },
];

/** Structure de départ d'une nouvelle séance, par sport. */
export const STARTERS: Record<Sport, string> = {
  Ride: '- 10m ramp 50-75%\n\n- 30m 70%\n\n- 10m 50%',
  Run: '- 10m 75% LTHR\n\n- 30m 85% LTHR\n\n- 5m 75% LTHR',
  Swim: '- 300mtr 70% Pace\n\n4x\n- 100mtr 90% Pace\n- 20s 40% Pace\n\n- 200mtr 65% Pace',
};

/**
 * Couleur d'un palier selon la zone : puissance (% FTP, Coggan), cardio
 * (% FC seuil, Friel) ou allure (% de l'allure seuil).
 */
export function zoneColor(pct: number, target: TargetKind = 'power'): string {
  const bounds =
    target === 'hr' ? [81, 90, 94, 100, 103] : target === 'hrmax' ? [68, 83, 88, 93, 97] : target === 'pace' ? [78, 88, 95, 101, 108] : [56, 76, 91, 106, 121];
  const colors = ['var(--label-3)', 'var(--blue)', 'var(--green)', 'var(--yellow)', 'var(--orange)', 'var(--red)'];
  const i = bounds.findIndex((b) => pct < b);
  return colors[i < 0 ? bounds.length : i];
}
