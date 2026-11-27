/**
 * Parsing rapide d'une ligne de séance en français vers le format Intervals.icu.
 *
 * Exemple :
 *   Input:  "15' échauf, 2x20 à 95% r5, 10' calme"
 *   Output: { text: "Échauffement\n- 15m ramp 50-75%\n\n2x\n- 20m 95%\n- 5m 55%\n\nRetour au calme\n- 10m 50%",
 *            tokens: [
 *              { kind: 'warmup', label: 'Échauffement 15 min' },
 *              { kind: 'interval', label: '2× 20 min · 95%' },
 *              { kind: 'recovery', label: 'récup 5 min' },
 *              { kind: 'cooldown', label: 'Calme 10 min' }
 *            ],
 *            unknown: [],
 *            name: 'Seuil 2×20' }
 */

export interface QuickToken {
  kind: 'warmup' | 'interval' | 'recovery' | 'steady' | 'cooldown';
  label: string;
}

export interface QuickResult {
  /** Texte au format Intervals.icu, lignes séparées par \n, répétitions en bloc Nx + lignes + ligne vide */
  text: string;
  /** Une puce par morceau compris */
  tokens: QuickToken[];
  /** Morceaux non compris */
  unknown: string[];
  /** Nom proposé : « Seuil 2×20 », « Sweet spot 3×12 », « VO2max 5×4 », « Sprints 8×15 s », « Endurance 1 h 30 » */
  name: string;
}

export type Variant = 'courte' | 'standard' | 'longue';

/** Normalize French input: lowercase, remove accents, normalize apostrophes/quotes, trim */
function normalize(s: string): string {
  return s
    .toLowerCase()
    // Normalize × to x (multiplication sign to letter x)
    .replace(/×/g, 'x')
    // Normalize various quote marks to apostrophe
    .replace(/['´`']/g, "'")
    // Normalize various apostrophes to single quote
    .replace(/['']/g, "'")
    // Remove accents
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Parse duration from various formats:
 * "15'", "15 min", "15m", "1h30", "1 h 30", "90'", "30s", "30 s", "15''" (seconds)
 * Returns seconds, or null if not recognized.
 */
function parseDurationStr(s: string): number | null {
  const normalized = normalize(s).trim();

  // Try each format in order of specificity

  // Format: N h M (hours + minutes): 1h30, 1h 30, 1h30m, 1h 30m, 1 h 30, 1 h 30 m
  // Need to handle spaces between h and minutes
  const hmsMatch = /^(\d+)\s*h\s*(\d+)\s*m?$/.exec(normalized);
  if (hmsMatch) {
    const h = Number(hmsMatch[1]);
    const m = Number(hmsMatch[2]);
    return h * 3600 + m * 60;
  }

  // Format: N h (hours only)
  const hMatch = /^(\d+)\s*h$/.exec(normalized);
  if (hMatch) {
    return Number(hMatch[1]) * 3600;
  }

  // Format: 30s, 30 s (seconds with 's')
  const sMatch = /^(\d+)\s*s$/.exec(normalized);
  if (sMatch) {
    return Number(sMatch[1]);
  }

  // Format: 15'' (double apostrophe = seconds)
  if (/^(\d+)''$/.test(normalized)) {
    return Number(/^(\d+)/.exec(normalized)![1]);
  }

  // Format: 90m, 90min, 90' (minutes)
  const mMatch = /^(\d+)\s*(?:min|m|')$/.exec(normalized);
  if (mMatch) {
    return Number(mMatch[1]) * 60;
  }

  return null;
}

/** Parse intensity: "95%", "88-93%", "95", "88-93", or keywords */
function parseIntensity(s: string): { from: number; to: number } | null {
  const normalized = normalize(s);

  // Percentage format: 95%, 88-93%, 95, 88-93
  const pctMatch = /^(\d{1,3})(?:-(\d{1,3}))?%?$/.exec(normalized);
  if (pctMatch) {
    const a = Number(pctMatch[1]);
    const b = pctMatch[2] ? Number(pctMatch[2]) : a;
    if (a <= 200 && b <= 200) {
      return { from: a, to: b };
    }
  }

  // Keywords (case-insensitive, with accent tolerance)
  const keywords: Record<string, { from: number; to: number }> = {
    recup: { from: 50, to: 55 },
    calme: { from: 50, to: 55 },
    z1: { from: 50, to: 55 },
    endu: { from: 65, to: 75 },
    endurance: { from: 65, to: 75 },
    z2: { from: 65, to: 75 },
    tempo: { from: 76, to: 87 },
    z3: { from: 76, to: 87 },
    ss: { from: 88, to: 93 },
    sweet: { from: 88, to: 93 },
    spot: { from: 88, to: 93 },
    seuil: { from: 95, to: 100 },
    ftp: { from: 95, to: 100 },
    z4: { from: 95, to: 100 },
    vo2: { from: 110, to: 120 },
    vo2max: { from: 110, to: 120 },
    z5: { from: 110, to: 120 },
    sprint: { from: 150, to: 150 },
    z6: { from: 150, to: 150 },
  };

  for (const [kw, range] of Object.entries(keywords)) {
    if (normalized.includes(kw)) {
      return range;
    }
  }

  return null;
}


/** Detect section type from keywords */
function detectSectionType(segment: string): 'warmup' | 'cooldown' | 'main' {
  const normalized = normalize(segment);
  // Warmup: échauffement, échauff, EC (with word boundaries to avoid matching "EC" in "recup")
  if (/(?:^|[\s-])echauf|(?:^|[\s-])ec(?:[\s-]|$)|warm/i.test(' ' + normalized + ' ')) return 'warmup';
  if (/calme|rac|retour|cool/.test(normalized)) return 'cooldown';
  return 'main';
}

/** Format seconds to Intervals.icu duration format */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  // Check if has cleanly separated hours and minutes
  if (seconds >= 3600 && seconds % 60 === 0) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    if (mins > 0) {
      return `${hours}h${mins}m`;
    }
    return `${hours}h`;
  }
  // Otherwise use minutes
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

/** Format seconds to user-friendly label */
function formatDurationLabel(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (mins === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${mins}`;
}

/** Category name from intensity percentage */
function categoryName(intensity: number): string {
  if (intensity <= 60) return 'Récup';
  if (intensity <= 75) return 'Endurance';
  if (intensity <= 87) return 'Tempo';
  if (intensity <= 93) return 'Sweet spot';
  if (intensity <= 109) return 'Seuil';
  if (intensity <= 125) return 'VO2max';
  return 'Sprints';
}

interface ParsedSegment {
  type: 'warmup' | 'cooldown' | 'main';
  duration: number;
  intensity: { from: number; to: number } | null;
  repeats: number | null;
  recovery: number | null;
  raw: string;
}

/** Parse a single segment of the input */
function parseSegment(segment: string): ParsedSegment | null {
  const raw = segment.trim();
  if (!raw) return null;

  const type = detectSectionType(raw);
  const normalized = normalize(raw);

  // Extract repeats first (e.g., "2x20" or "3x12")
  let repeats: number | null = null;
  const repeatsMatch = /(\d+)\s*x/i.exec(normalized);
  if (repeatsMatch) {
    repeats = Number(repeatsMatch[1]);
  }

  // Extract recovery (e.g., "r5", "r 5m", "r30s", "recup 5")
  let recovery: number | null = null;
  if (repeats) {
    // Try seconds first (most specific: r30s)
    const sRecoveryMatch = /(?:^|\s)r\s*(\d+)\s*s/i.exec(normalized);
    if (sRecoveryMatch) {
      recovery = Number(sRecoveryMatch[1]); // seconds
    } else {
      // Try minutes (r5, r 5m, récup 5)
      const mRecoveryMatch = /(?:^|\s)r\s*(\d+)(?:\s*(?:m|min|'))?(?:\s|$)|recup\s*(\d+)/i.exec(normalized);
      if (mRecoveryMatch) {
        recovery = Number(mRecoveryMatch[1] ?? mRecoveryMatch[2]) * 60; // minutes
      }
    }
  }

  // Extract duration: look for patterns like "20m", "20 min", "30s", "1h30", "1h 30m"
  let duration: number | null = null;

  // Try to extract all duration-like tokens and parse them
  // Patterns: (number)(unit) or (number)h(number) for combined hours+minutes
  // Use word boundaries to avoid matching keywords like "ss" or "sweet"
  const durationTokens = normalized.match(
    /(?:(\d+)\s*h\s*(\d+)\s*m?)|(\d+)\s*(?:h|min|m(?![a-z])|s(?![a-z])|''|')/gi
  ) || [];

  for (const token of durationTokens) {
    const parsed = parseDurationStr(token);
    if (parsed && parsed > 0) {
      duration = parsed;
      break;
    }
  }

  // If repeats exist but no duration found yet, try extracting number adjacent to x
  if (repeats && !duration && repeatsMatch) {
    // Look for "2x20" or "2x20m" or "2x20 min" pattern - extract what comes after x
    const afterX = /x\s*(\d+)\s*(?:min|m)?/i.exec(normalized);
    if (afterX) {
      // This is "NxD" where D is the duration in minutes (default)
      duration = Number(afterX[1]) * 60;
    }
  }

  if (duration === null) {
    return null; // No valid duration found
  }

  // Extract intensity: percentage (e.g., "95%", "88-93%") or keywords
  let intensity: { from: number; to: number } | null = null;

  // Try percentage first
  const pctMatch = /(\d{1,3})(?:-(\d{1,3}))?%/.exec(normalized);
  if (pctMatch) {
    intensity = parseIntensity(pctMatch[0]);
  } else {
    // Try keywords
    const keywordMatch = /(?:recup|calme|echauf|endu|endurance|tempo|ss|sweet|spot|seuil|ftp|vo2|sprint|z[1-6])/i.exec(
      normalized
    );
    if (keywordMatch) {
      intensity = parseIntensity(keywordMatch[0]);
    }
  }

  return { type, duration, intensity, repeats, recovery, raw };
}

/**
 * Parse quick French input into Intervals.icu format.
 * Input: "15' échauf, 2x20 à 95% r5, 10' calme"
 */
export function parseQuick(input: string): QuickResult {
  // Split by separators: , ; puis +
  const segments = input
    .split(/[,;]|puis|\+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const tokens: QuickToken[] = [];
  const unknown: string[] = [];
  const sections: string[] = []; // Each section is a complete block with blank line

  let mainBlockInfo: {
    duration: number;
    intensity: { from: number; to: number } | null;
    repeats: number | null;
  } | null = null;

  for (const segment of segments) {
    const parsed = parseSegment(segment);

    if (!parsed) {
      unknown.push(segment);
      continue;
    }

    const { type, duration, intensity, repeats, recovery } = parsed;
    let sectionText: string;

    if (type === 'warmup') {
      // Échauffement: ramp from 50% to 75%
      sectionText = `Échauffement\n- ${formatDuration(duration)} ramp 50-75%`;
      tokens.push({
        kind: 'warmup',
        label: `Échauffement ${formatDurationLabel(duration)}`,
      });
    } else if (type === 'cooldown') {
      // Retour au calme: 50-55%
      const targetIntensity = intensity?.from ?? 50;
      sectionText = `Retour au calme\n- ${formatDuration(duration)} ${targetIntensity}%`;
      tokens.push({
        kind: 'cooldown',
        label: `Calme ${formatDurationLabel(duration)}`,
      });
    } else {
      // Main block
      const targetIntensity = intensity?.from ?? 70;
      const targetIntensityStr =
        intensity && intensity.from !== intensity.to
          ? `${intensity.from}-${intensity.to}%`
          : `${targetIntensity}%`;

      if (repeats && recovery) {
        // Format: Nx\n- Dm I%\n- Rm 55%
        sectionText = `${repeats}x\n- ${formatDuration(duration)} ${targetIntensityStr}\n- ${formatDuration(recovery)} 55%`;

        // Token: show interval and recovery separately
        tokens.push({
          kind: 'interval',
          label: `${repeats}× ${formatDurationLabel(duration)} · ${targetIntensity}%`,
        });
        tokens.push({
          kind: 'recovery',
          label: `récup ${formatDurationLabel(recovery)}`,
        });

        mainBlockInfo = { duration, intensity, repeats };
      } else if (repeats) {
        // Format: Nx\n- Dm I%
        sectionText = `${repeats}x\n- ${formatDuration(duration)} ${targetIntensityStr}`;

        tokens.push({
          kind: 'interval',
          label: `${repeats}× ${formatDurationLabel(duration)} · ${targetIntensity}%`,
        });

        mainBlockInfo = { duration, intensity, repeats };
      } else {
        // Format: - Dm I%
        sectionText = `- ${formatDuration(duration)} ${targetIntensityStr}`;

        tokens.push({
          kind: 'steady',
          label: `${formatDurationLabel(duration)} · ${targetIntensity}%`,
        });

        mainBlockInfo = { duration, intensity, repeats: null };
      }
    }

    sections.push(sectionText);
  }

  // Build text with blank lines between sections
  const text = sections.join('\n\n');

  // Generate name from main block
  const name = generateName(mainBlockInfo);

  return { text, tokens, unknown, name };
}

function generateName(mainBlockInfo: { duration: number; intensity: { from: number; to: number } | null; repeats: number | null } | null): string {
  if (!mainBlockInfo) return 'Séance';

  const intensity = mainBlockInfo.intensity?.from ?? 70;
  const category = categoryName(intensity);

  if (mainBlockInfo.repeats) {
    // Format: Category Nx D
    if (mainBlockInfo.duration < 60) {
      // Seconds
      return `${category} ${mainBlockInfo.repeats}×${mainBlockInfo.duration} s`;
    }
    const minutes = Math.round(mainBlockInfo.duration / 60);
    return `${category} ${mainBlockInfo.repeats}×${minutes}`;
  }

  // Format: Category Duration
  const duration = formatDurationLabel(mainBlockInfo.duration);
  return `${category} ${duration}`;
}

/**
 * Adjust a parsed workout text to a variant (courte/standard/longue).
 * - courte: −1 repeat (min 1) + if single repeat, −25% duration; without repeat, −25% on longest block
 * - longue: +1 repeat; without repeat, +25% on longest block
 * - standard: unchanged
 */
export function variantOf(text: string, variant: Variant): string {
  if (variant === 'standard') return text;

  const lines = text.split('\n');
  const result: string[] = [];

  let repeatLineIndex = -1;
  let repeatCount = 0;

  // Find repeat line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = /^(\d+)x$/.exec(line);
    if (match) {
      repeatLineIndex = i;
      repeatCount = Number(match[1]);
      break;
    }
  }

  if (repeatLineIndex >= 0) {
    // We have a repeat block: modify repeat count
    let newRepeatCount = repeatCount;
    if (variant === 'courte') {
      newRepeatCount = Math.max(1, repeatCount - 1);
    } else if (variant === 'longue') {
      newRepeatCount = repeatCount + 1;
    }

    for (let i = 0; i < lines.length; i++) {
      if (i === repeatLineIndex) {
        result.push(`${newRepeatCount}x`);
      } else if (variant === 'courte' && repeatCount === 1 && i === repeatLineIndex + 1) {
        // Single repeat reduced by 25% on first step only
        const line = lines[i];
        const match = /^-\s+([0-9hms]+)(.*)$/.exec(line);
        if (match) {
          const duration = parseDurationStr(match[1]);
          if (duration) {
            const newDuration = Math.round(duration * 0.75);
            const formatted = formatDuration(newDuration);
            result.push(`- ${formatted}${match[2]}`);
          } else {
            result.push(line);
          }
        } else {
          result.push(line);
        }
      } else {
        result.push(lines[i]);
      }
    }
  } else {
    // No repeat block: modify longest non-title line
    let longestLineIndex = -1;
    let longestDuration = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip titles (lines without '-') and blank lines
      if (!line.startsWith('-') || !line) continue;

      const match = /^-\s+([0-9hms]+)/.exec(line);
      if (match) {
        const duration = parseDurationStr(match[1]);
        if (duration && duration > longestDuration) {
          longestDuration = duration;
          longestLineIndex = i;
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      if (i === longestLineIndex) {
        const line = lines[i];
        const match = /^-\s+([0-9hms]+)(.*)$/.exec(line);
        if (match) {
          const duration = parseDurationStr(match[1]);
          if (duration) {
            const factor = variant === 'courte' ? 0.75 : 1.25;
            const newDuration = Math.round(duration * factor);
            const formatted = formatDuration(newDuration);
            result.push(`- ${formatted}${match[2]}`);
          } else {
            result.push(line);
          }
        } else {
          result.push(line);
        }
      } else {
        result.push(lines[i]);
      }
    }
  }

  return result.join('\n');
}
