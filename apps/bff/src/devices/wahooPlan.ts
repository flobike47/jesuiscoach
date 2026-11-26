import { estimatedSeconds, parseWorkoutText, type RampBlock, type StepBlock, type Target, type WorkoutBlock, type WorkoutSport } from '../lib/workoutText.js';

/**
 * Séance de l'app → plan.json Wahoo (version 1.0.0). Fonction pure : aucune
 * requête, aucun appel. Une séance qui ne se convertit pas fidèlement donne
 * `ok: false` avec la raison (affichée dans le calendrier, pas une erreur).
 *
 * Correspondances (docs/plans/E-appareils-wahoo.md) :
 *  - % FTP → cible `ftp` ; % LTHR → `threshold_hr` ; % Pace → `threshold_speed`
 *    (fraction de la référence de la fiche profil) ;
 *  - cadence → cible `rpm` après la cible principale (vélo seulement) ;
 *  - rampe → un intervalle avec la plage début → fin ;
 *  - répétition N× → `exit_trigger_type: 'repeat'`, `exit_trigger_value: N − 1` ;
 *  - premier et dernier palier (vélo / course) → `wu` / `cd` ; sinon selon l'intensité.
 */

/** Type de séance de la montre (constantes nommées : valeurs à confirmer à l'activation). */
export const WAHOO_FAMILY: Record<'Ride' | 'Run', number> = { Ride: 0, Run: 1 };
/** Lieu : 1 = extérieur (à confirmer avec le compteur réel). */
export const WAHOO_LOCATION_OUTDOOR = 1;

export interface PlanThresholds {
  /** FTP vélo, en watts. */
  ftp: number | null;
  /** FC seuil du sport de la séance, en battements/min. */
  lthr: number | null;
  /** Vitesse seuil de course, en m/s (1000 / allure en s/km). */
  thresholdSpeed: number | null;
}

export type IntensityType = 'active' | 'wu' | 'lt' | 'recover' | 'cd';

export interface WahooTarget {
  type: 'ftp' | 'threshold_hr' | 'threshold_speed' | 'rpm';
  low: number;
  high: number;
}

export interface WahooInterval {
  name: string;
  exit_trigger_type: 'time' | 'distance' | 'repeat';
  exit_trigger_value: number;
  intensity_type?: IntensityType;
  targets?: WahooTarget[];
  intervals?: WahooInterval[];
}

export interface WahooPlanJson {
  header: {
    name: string;
    version: '1.0.0';
    description: string;
    workout_type_family: number;
    workout_type_location: number;
    ftp?: number;
    threshold_hr?: number;
    threshold_speed?: number;
  };
  intervals: WahooInterval[];
}

export type PlanResult = { ok: true; plan: WahooPlanJson; minutes: number } | { ok: false; reason: string };

export interface PlanInput {
  sport: WorkoutSport;
  name: string;
  description: string | null;
  text: string;
  thresholds: PlanThresholds;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const fraction = (pct: number) => round3(pct / 100);

class Unsupported extends Error {}

/** Cible principale d'un palier : référence (FTP, FC seuil, allure seuil) et plage en fractions. */
function mainTarget(target: Target, low: number, high: number, sport: WorkoutSport, th: PlanThresholds): WahooTarget {
  const range = { low: fraction(low), high: fraction(high) };
  if (sport === 'Swim') throw new Unsupported('natation non prise en charge');
  if (target === 'hrmax') throw new Unsupported('% de FC max non pris en charge');
  if (target === 'power') {
    if (sport !== 'Ride') throw new Unsupported('cible en % FTP réservée au vélo');
    if (th.ftp == null) throw new Unsupported('FTP absente de la fiche profil');
    return { type: 'ftp', ...range };
  }
  if (target === 'hr') {
    if (th.lthr == null) throw new Unsupported('FC seuil absente de la fiche profil');
    return { type: 'threshold_hr', ...range };
  }
  if (sport !== 'Run') throw new Unsupported('cible en allure réservée à la course');
  if (th.thresholdSpeed == null) throw new Unsupported('allure seuil absente de la fiche profil');
  return { type: 'threshold_speed', ...range };
}

/** Intensité Wahoo d'un palier : positionnelle (échauffement, retour au calme) d'abord, sinon d'après le %. */
function intensityOf(pct: number): IntensityType {
  if (pct >= 100) return 'lt';
  if (pct < 60) return 'recover';
  return 'active';
}

function stepInterval(b: StepBlock | RampBlock, sport: WorkoutSport, th: PlanThresholds, position: IntensityType | null): WahooInterval {
  const low = b.kind === 'ramp' ? Math.min(b.from, b.to) : b.low;
  const high = b.kind === 'ramp' ? Math.max(b.from, b.to) : b.high;
  const targets: WahooTarget[] = [mainTarget(b.target, low, high, sport, th)];
  if (b.cadence) {
    if (sport !== 'Ride') throw new Unsupported('cadence de course non prise en charge');
    targets.push({ type: 'rpm', low: b.cadence.low, high: b.cadence.high });
  }
  const timed = b.seconds > 0;
  const mid = (low + high) / 2;
  return {
    name: b.title ?? 'Palier',
    exit_trigger_type: timed ? 'time' : 'distance',
    exit_trigger_value: timed ? b.seconds : b.meters,
    intensity_type: position ?? intensityOf(mid),
    targets,
  };
}

/**
 * Convertit les blocs de premier niveau. Les paliers hors répétition en position
 * de premier ou dernier bloc reçoivent `wu` / `cd` ; une répétition de 1 fois est
 * dépliée (Wahoo ne traite pas `repeat` avec 0 reprise).
 */
function convertBlocks(blocks: WorkoutBlock[], sport: WorkoutSport, th: PlanThresholds): WahooInterval[] {
  return blocks.flatMap((b, index): WahooInterval[] => {
    const first = index === 0 && blocks.length > 1;
    const last = index === blocks.length - 1 && blocks.length > 1;
    const position: IntensityType | null = first ? 'wu' : last ? 'cd' : null;
    if (b.kind === 'repeat') {
      const inner = b.steps.map((s) => stepInterval(s, sport, th, null));
      if (b.count === 1) return inner;
      return [{ name: b.title ?? `${b.count} ×`, exit_trigger_type: 'repeat', exit_trigger_value: b.count - 1, intervals: inner }];
    }
    return [stepInterval(b, sport, th, position)];
  });
}

/** Séance texte → plan Wahoo, ou raison de non-conversion. */
export function buildWahooPlan(input: PlanInput): PlanResult {
  const sport = input.sport;
  if (sport === 'Swim') return { ok: false, reason: 'natation non prise en charge' };
  const { blocks, unsupported } = parseWorkoutText(input.text);
  if (unsupported.length) return { ok: false, reason: `ligne non prise en charge : « ${unsupported[0].slice(0, 80)} »` };
  if (blocks.length === 0) return { ok: false, reason: 'séance vide' };
  try {
    const th = input.thresholds;
    const intervals = convertBlocks(blocks, sport, th);
    const header: WahooPlanJson['header'] = {
      name: input.name,
      version: '1.0.0',
      description: input.description ?? '',
      workout_type_family: WAHOO_FAMILY[sport],
      workout_type_location: WAHOO_LOCATION_OUTDOOR,
      ...(th.ftp != null && sport === 'Ride' ? { ftp: Math.round(th.ftp) } : {}),
      ...(th.lthr != null ? { threshold_hr: Math.round(th.lthr) } : {}),
      ...(th.thresholdSpeed != null && sport === 'Run' ? { threshold_speed: round3(th.thresholdSpeed) } : {}),
    };
    const minutes = Math.max(1, Math.ceil(estimatedSeconds(blocks, sport) / 60));
    return { ok: true, plan: { header, intervals }, minutes };
  } catch (err) {
    if (err instanceof Unsupported) return { ok: false, reason: err.message };
    throw err;
  }
}
