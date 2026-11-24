/**
 * Format texte des séances Intervals.icu (le même que dans leur éditeur) :
 *
 *   Échauffement            ← titre de section (ignoré pour le calcul)
 *   - 15m ramp 50-75%       ← palier : durée, (rampe), intensité en % FTP
 *
 *   3x                      ← répétition des paliers qui suivent,
 *   - 10m 95-100%             jusqu'à la prochaine ligne vide
 *   - 5m 55%
 *
 * Durées : 1h, 10m, 30s, 3m45s, 1h30m. Pur : sans DOM ni React.
 */

export interface Step {
  seconds: number;
  /** % FTP au début et à la fin (égaux hors rampe). */
  from: number;
  to: number;
}

export interface WorkoutStats {
  seconds: number;
  /** Charge estimée (équivalent intensité² × heures × 100). */
  load: number;
  /** Intensité moyenne pondérée (≈ puissance pondérée / FTP). */
  intensity: number;
}

const DURATION_RE = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
const PCT_RE = /^(\d{1,3})(?:-(\d{1,3}))?%$/;
const REPEAT_RE = /^(\d{1,2})\s*x$/i;

export function parseDuration(token: string): number | null {
  const m = DURATION_RE.exec(token);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Lit une ligne de palier « - 10m 95-100% » ; null si ce n'en est pas une. */
export function parseStep(line: string): Step | null {
  const t = line.trim();
  if (!t.startsWith('-')) return null;
  const tokens = t.slice(1).trim().split(/\s+/);
  const seconds = parseDuration(tokens[0] ?? '');
  if (seconds == null) return null;
  const ramp = tokens.includes('ramp');
  const pct = tokens.map((x) => PCT_RE.exec(x)).find(Boolean);
  if (!pct) return null;
  const a = Number(pct[1]);
  const b = pct[2] ? Number(pct[2]) : a;
  // Plage simple (« 65-75% ») : on retient le milieu ; rampe : début → fin.
  return ramp ? { seconds, from: a, to: b } : { seconds, from: (a + b) / 2, to: (a + b) / 2 };
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

export function workoutStats(steps: Step[]): WorkoutStats {
  let seconds = 0;
  let weighted = 0;
  for (const s of steps) {
    seconds += s.seconds;
    // Intensité² moyenne sur la rampe (intégrale exacte d'une droite au carré).
    const a = s.from / 100;
    const b = s.to / 100;
    weighted += s.seconds * ((a * a + a * b + b * b) / 3);
  }
  const hours = seconds / 3600;
  const intensity = seconds ? Math.sqrt(weighted / seconds) : 0;
  return { seconds, load: Math.round(hours * intensity * intensity * 100), intensity: Math.round(intensity * 100) / 100 };
}

export interface WorkoutTemplate {
  name: string;
  description: string;
}

/** Bibliothèque par défaut (reprise de la démo). */
export const TEMPLATES: WorkoutTemplate[] = [
  { name: 'Endurance 2 h', description: 'Échauffement\n- 10m ramp 50-65%\n\nEndurance\n- 100m 65-75%\n\nRetour au calme\n- 10m 55%' },
  { name: 'Sweet spot 3×12', description: 'Échauffement\n- 15m ramp 50-75%\n\n3x\n- 12m 88-93%\n- 5m 55%\n\nRetour au calme\n- 10m 50%' },
  { name: 'Seuil 3×10', description: 'Échauffement\n- 15m ramp 50-75%\n\n3x\n- 10m 95-100%\n- 5m 55%\n\nRetour au calme\n- 10m 50%' },
  { name: 'VO2max 5×4', description: 'Échauffement\n- 15m ramp 50-75%\n\n5x\n- 4m 110-120%\n- 4m 50%\n\nRetour au calme\n- 10m 50%' },
  { name: 'Sprints 8×15 s', description: 'Échauffement\n- 20m ramp 50-70%\n\n8x\n- 15s 200%\n- 3m45s 55%\n\nRetour au calme\n- 15m 55%' },
  { name: 'Récupération 45 min', description: '- 45m 45-55%' },
];

/** Couleur d'un palier selon la zone (Z1 → Z6). */
export function zoneColor(pct: number): string {
  if (pct < 56) return 'var(--label-3)';
  if (pct < 76) return 'var(--blue)';
  if (pct < 91) return 'var(--green)';
  if (pct < 106) return 'var(--yellow)';
  if (pct < 121) return 'var(--orange)';
  return 'var(--red)';
}
