/**
 * Construction d'un bloc d'entraînement jusqu'à une course.
 * Périodisation : cycles développement/allégée, spécifique, affûtage.
 * Répartition des séances clés, volume progressif, estimateur de forme par fitness/fatigue.
 */

import { TEMPLATES, parseWorkout, workoutStats, type Sport } from './workout';
import { variantOf } from './quickWorkout';

export type Phase = 'developpement' | 'allegee' | 'specifique' | 'affutage' | 'course';

export interface BlockInput {
  today: string;
  raceDate: string;
  raceName: string;
  sport: Sport;
  weeklyHours: { from: number; to: number };
  availableWeekdays: number[];
  maxMinutesByWeekday?: Partial<Record<number, number>>;
  keySessions: Array<'sweet spot' | 'seuil' | 'vo2' | 'longue'>;
  cycle: 3 | 2;
}

export interface BlockWorkout {
  date: string;
  name: string;
  description: string;
  seconds: number;
  load: number;
  key: boolean;
}

export interface BlockWeek {
  start: string;
  phase: Phase;
  load: number;
  seconds: number;
  workouts: BlockWorkout[];
  summary: string;
}

export interface Block {
  weeks: BlockWeek[];
  totalWorkouts: number;
  estimatedRaceForm: number;
}

/** Format ISO date AAAA-MM-JJ. */
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date → ISO AAAA-MM-JJ. */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lundi de la semaine contenant la date (0 = lundi, 6 = dimanche). */
function mondayOf(d: Date): Date {
  const dow = d.getDay(); // 0 = dimanche, 1 = lundi
  const offset = dow === 0 ? 6 : dow - 1; // lundi = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

/** Lundi suivant (ou cette semaine si d est déjà lundi). */
function nextMonday(d: Date): Date {
  const mon = mondayOf(d);
  if (mon.getTime() === d.getTime()) return mon;
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
}

/** Nombre de semaines complètes de today (lundi incl.) à raceDate (lundi incl.) */
function weekCount(today: Date, raceDate: Date): number {
  const mon = nextMonday(today);
  const raceMonday = mondayOf(raceDate);
  const days = (raceMonday.getTime() - mon.getTime()) / (1000 * 60 * 60 * 24);
  return Math.floor(days / 7) + 1;
}


type KeyType = BlockInput['keySessions'][number];

const KEY_TEMPLATE: Record<KeyType, string> = { 'sweet spot': 'Sweet spot', seuil: 'Seuil', vo2: 'VO2max', longue: 'Endurance' };
/** Ordre de préférence des jours pour les séances clés : milieu de semaine d'abord. */
const KEY_DAYS = [1, 3, 2, 4, 0, 5, 6];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Séance type du sport pour un type de séance clé (nom et texte). */
function findTemplate(sport: Sport, type: KeyType): { name: string; description: string } | null {
  const t = TEMPLATES.find((x) => x.sport === sport && x.name.startsWith(KEY_TEMPLATE[type]));
  return t ? { name: t.name, description: t.description } : null;
}

const VARIANT_SUFFIX = { courte: ' (courte)', standard: '', longue: ' (longue)' } as const;

/** Variante courte/standard/longue selon la phase et la place dans le cycle. */
function variantForPhase(phase: Phase, weekInCycle: number, maxCycleWeek: number): 'courte' | 'standard' | 'longue' {
  if (phase === 'allegee' || phase === 'affutage' || phase === 'course') return 'courte';
  if (phase === 'developpement' && weekInCycle === maxCycleWeek) return 'longue';
  return 'standard';
}

function workoutOf(date: Date, name: string, description: string, key: boolean): BlockWorkout {
  const stats = workoutStats(parseWorkout(description));
  return { date: formatDate(date), name, description, seconds: stats.seconds, load: stats.load, key };
}

/** Endurance de N minutes, arrondie au quart d'heure (30 min au moins). */
function endurance(minutes: number): { name: string; description: string } {
  const m = Math.max(30, Math.round(minutes / 15) * 15);
  return { name: `Endurance ${durationLabel(m)}`, description: `- ${m}m 65-75%` };
}

/** « 45 min », « 2 h », « 1 h 15 ». */
function durationLabel(minutes: number): string {
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`;
}

/**
 * Une semaine du bloc. Règles : une séance par jour au plus, uniquement sur
 * les jours disponibles et dans leur durée maximale ; séances clés jamais
 * deux jours de suite, de préférence en semaine ; sortie longue le dimanche
 * (sinon le samedi) ; l'endurance complète le volume sur les jours libres.
 */
function buildWeek(
  monday: Date,
  phase: Phase,
  targetHours: number,
  availableWeekdays: number[],
  maxMinutes: Partial<Record<number, number>>,
  keySessions: KeyType[],
  sport: Sport,
  keyIndex: number,
  weekInCycle: number,
  cycleLength: number,
  raceDate: Date,
): BlockWeek {
  const dateOf = (wd: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + wd);
  const raceDay = Math.round((raceDate.getTime() - monday.getTime()) / DAY_MS);
  // Semaine de course : repos les 2 jours avant le jour J, rien après.
  const open = availableWeekdays.filter((wd) => phase !== 'course' || wd <= raceDay - 3);
  const cap = (wd: number) => maxMinutes[wd] ?? Infinity;
  const used = new Set<number>();
  const keyDays: number[] = [];
  const workouts: BlockWorkout[] = [];
  let seconds = 0;
  const add = (wd: number, name: string, description: string, key: boolean) => {
    const w = workoutOf(dateOf(wd), name, description, key);
    used.add(wd);
    if (key) keyDays.push(wd);
    workouts.push(w);
    seconds += w.seconds;
  };
  const fits = (wd: number, description: string) => workoutStats(parseWorkout(description)).seconds <= cap(wd) * 60;

  const placeKey = (type: KeyType, variant: 'courte' | 'standard' | 'longue') => {
    const t = findTemplate(sport, type);
    if (!t) return;
    const description = variantOf(t.description, variant);
    // La sortie longue reste le week-end ; les autres séances clés en semaine d'abord.
    const order = type === 'longue' ? [6, 5, ...KEY_DAYS] : KEY_DAYS;
    const wd = order.find((d) => open.includes(d) && !used.has(d) && keyDays.every((k) => Math.abs(k - d) > 1) && fits(d, description));
    if (wd == null) return;
    const name = type === 'longue' ? `Sortie longue ${durationLabel(workoutStats(parseWorkout(description)).seconds / 60)}` : `${t.name}${VARIANT_SUFFIX[variant]}`;
    add(wd, name, description, true);
  };

  const keyCount = phase === 'developpement' || phase === 'specifique' || phase === 'affutage' ? 2 : phase === 'allegee' || phase === 'course' ? 1 : 0;
  const variant = variantForPhase(phase, weekInCycle, cycleLength);
  for (let i = 0; i < keyCount; i++) placeKey(keySessions[(keyIndex + i) % keySessions.length], variant);

  // Sortie longue du week-end (développement et spécifique) : un quart du volume, 2 h au moins.
  const target = targetHours * 3600;
  const hasLong = workouts.some((w) => w.name.startsWith('Sortie longue'));
  if ((phase === 'developpement' || phase === 'specifique') && !hasLong) {
    const wd = [6, 5].find((d) => open.includes(d) && !used.has(d));
    if (wd != null) {
      const e = endurance(Math.min(cap(wd), Math.max(120, (target * 0.25) / 60)));
      add(wd, e.name.replace('Endurance', 'Sortie longue'), e.description, false);
    }
  }

  // Endurance répartie sur les jours libres restants pour approcher le volume.
  if (phase !== 'course') {
    const free = open.filter((d) => !used.has(d));
    let remaining = (target - seconds) / 60;
    for (const [i, wd] of free.entries()) {
      if (remaining < 30) break;
      const share = Math.min(cap(wd), remaining / (free.length - i), phase === 'affutage' ? 45 : 90);
      if (share < 30) continue;
      const e = endurance(share);
      add(wd, e.name, e.description, false);
      remaining -= workoutStats(parseWorkout(e.description)).seconds / 60;
    }
  }

  // Le jour J (nommé par buildBlock).
  if (phase === 'course') workouts.push({ date: formatDate(raceDate), name: '', description: '', seconds: 0, load: 0, key: true });

  workouts.sort((a, b) => a.date.localeCompare(b.date));
  const load = workouts.reduce((s, w) => s + w.load, 0);
  const main = workouts.filter((w) => w.key && w.description).slice(0, 2);
  return { start: formatDate(monday), phase, load, seconds, workouts, summary: main.map((w) => w.name).join(', ') };
}

/**
 * Forme estimée le matin de la course : modèle fitness / fatigue jour par
 * jour (moyennes exponentielles de la charge quotidienne, constantes 42 j et
 * 7 j, comme Intervals.icu), départ à la charge quotidienne moyenne des deux
 * premières semaines (athlète déjà entraîné à ce niveau). Forme = fitness − fatigue.
 */
function estimateRaceForm(weeks: BlockWeek[], raceDate: string): number {
  if (weeks.length === 0) return 0;
  const daily = new Map<string, number>();
  for (const w of weeks) for (const x of w.workouts) daily.set(x.date, (daily.get(x.date) ?? 0) + x.load);
  const firstTwo = weeks.slice(0, 2).reduce((s, w) => s + w.load, 0) / (Math.min(2, weeks.length) * 7);
  let fitness = firstTwo;
  let fatigue = firstTwo;
  for (let d = parseDate(weeks[0].start); formatDate(d) < raceDate; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const load = daily.get(formatDate(d)) ?? 0;
    fitness += (load - fitness) / 42;
    fatigue += (load - fatigue) / 7;
  }
  return Math.round(fitness - fatigue);
}

/** Bloc complet, du lundi qui vient jusqu'à la semaine de la course. */
export function buildBlock(input: BlockInput): Block {
  const { today, raceDate, raceName, sport, weeklyHours, availableWeekdays, maxMinutesByWeekday, keySessions, cycle } = input;

  const todayDate = parseDate(today);
  const raceDateParsed = parseDate(raceDate);

  const nWeeks = weekCount(todayDate, raceDateParsed);
  const weeks: BlockWeek[] = [];

  let currentMonday = nextMonday(todayDate);
  let keySessionIndex = 0;

  for (let w = 0; w < nWeeks; w++) {
    let phase: Phase;

    // Détermine la phase : affutage (semaine avant course), spécifique (si bloc ≥5), cycles dev/allég
    const weeksRemaining = nWeeks - w;

    if (w === nWeeks - 1) {
      // Dernière semaine
      const raceMonday = mondayOf(raceDateParsed);
      phase = formatDate(raceMonday) === formatDate(currentMonday) ? 'course' : 'affutage';
    } else if (weeksRemaining === 2) {
      // 2 semaines avant la fin : affûtage
      phase = 'affutage';
    } else if (nWeeks >= 5 && weeksRemaining === 3) {
      // 3 semaines avant la fin (bloc ≥5 semaines) : spécifique
      phase = 'specifique';
    } else {
      // Cycles développement (cycle semaines) + allégée (1 semaine)
      const posInCycle = w % (cycle + 1);
      phase = posInCycle === cycle ? 'allegee' : 'developpement';
    }

    // Volume cible pour cette semaine
    let targetHours = weeklyHours.to;
    if (phase === 'course') {
      targetHours = 0;
    } else if (phase === 'allegee') {
      targetHours = weeklyHours.to * 0.55;
    } else if (phase === 'specifique') {
      targetHours = weeklyHours.to * 0.85;
    } else if (phase === 'affutage') {
      targetHours = weeklyHours.to * 0.45;
    } else if (phase === 'developpement') {
      // Progression linéaire de from à to
      const devWeeksTotal = nWeeks - 2 - (nWeeks >= 5 ? 1 : 0); // nombre total de semaines de développement
      const devWeekIndex = Array.from({ length: w + 1 }, (_, i) => {
        const posInCycle = i % (cycle + 1);
        return posInCycle === cycle ? -1 : i;
      }).filter((x) => x >= 0).length - 1;

      targetHours = weeklyHours.from + ((weeklyHours.to - weeklyHours.from) * devWeekIndex) / Math.max(1, devWeeksTotal - 1);
    }

    const week = buildWeek(
      currentMonday,
      phase,
      targetHours,
      availableWeekdays,
      maxMinutesByWeekday ?? {},
      keySessions,
      sport,
      keySessionIndex,
      (w % (cycle + 1)) + 1,
      cycle,
      raceDateParsed
    );

    // La course elle-même porte son nom.
    for (const x of week.workouts) if (!x.description && x.key) x.name = raceName;
    if (phase === 'course') week.summary = [week.summary, raceName].filter(Boolean).join(', ');
    weeks.push(week);

    // Mise à jour de l'index des séances clés
    if (phase === 'developpement') {
      keySessionIndex += 2;
    } else if (phase === 'allegee' || phase === 'specifique' || phase === 'affutage') {
      keySessionIndex += 1;
    }

    currentMonday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + 7);
  }

  const totalWorkouts = weeks.reduce((sum, w) => sum + w.workouts.length, 0);
  const estimatedRaceForm = estimateRaceForm(weeks, raceDate);

  return {
    weeks,
    totalWorkouts,
    estimatedRaceForm,
  };
}
