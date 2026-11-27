/**
 * Logique de planification intelligente : groupage des suggestions et mise à l'échelle des intensités.
 */

export interface Suggestion {
  athleteId: string;
  name: string;
  date: string | null;
  variant: 'courte' | 'standard' | 'longue';
  intensityScale: number;
  reasons: string[];
  alternatives: string[];
  replaces: { eventId: string; name: string } | null;
  blocked: string | null;
}

export interface GroupedForSending {
  date: string;
  description: string;
  athleteIds: string[];
  variant: 'courte' | 'standard' | 'longue';
}

/**
 * Multiplie les pourcentages d'intensité d'une séance par un facteur.
 * Exemple : « - 12m 88-93% » × 0,95 → « - 12m 84-88% »
 * Les lignes sans % et les répétitions (Nx) sont inchangées.
 */
export function scaleTargets(text: string, factor: number): string {
  if (factor === 1) return text;

  const lines = text.split('\n');
  return lines
    .map((line) => {
      // Extraire l'indentation
      const indent = line.match(/^\s*/)?.[0] ?? '';
      const trimmed = line.trim();

      // Ignorer les lignes qui ne commencent pas par '-' (titres, répétitions, etc.)
      if (!trimmed.startsWith('-')) return line;

      // Chercher le pourcentage à la fin : <digit>-<digit>% ou <digit>%
      // Pattern : ^- ... <pourcentage>-<pourcentage>% ou <pourcentage>%
      const match = /^(.*?)(\d+)(?:-(\d+))?%(.*)$/.exec(trimmed);
      if (!match) return line; // Pas de pourcentage trouvé

      const prefix = match[1]; // ex. "- 15m ramp "
      const from = Number(match[2]); // ex. 50
      const to = match[3] ? Number(match[3]) : from; // ex. 75
      const suffix = match[4]; // ex. ""

      const newFrom = Math.round(from * factor);
      const newTo = Math.round(to * factor);

      if (from === to) {
        return `${indent}${prefix}${newFrom}%${suffix}`;
      } else {
        return `${indent}${prefix}${newFrom}-${newTo}%${suffix}`;
      }
    })
    .join('\n');
}

/**
 * Regroupe les suggestions par (date, description).
 * Chaque groupe représente un envoi unique à un ensemble d'athlètes.
 * - Les suggestions avec date: null sont exclues
 * - Description = variantOf(base, variant) puis scaleTargets si intensityScale ≠ 1
 * - Paramètre variantOf : fonction pour appliquer une variante (voir lib/quickWorkout.ts)
 */
export function groupForSending(
  suggestions: Suggestion[],
  baseDescription: string,
  variantOf: (text: string, variant: 'courte' | 'standard' | 'longue') => string,
): GroupedForSending[] {
  const groups = new Map<string, { date: string; description: string; athleteIds: string[]; variant: 'courte' | 'standard' | 'longue' }>();

  for (const suggestion of suggestions) {
    // Ignorer les suggestions sans date
    if (!suggestion.date) continue;

    // Construire la description à partir de la variante et de l'intensité
    let description = baseDescription;
    if (suggestion.variant !== 'standard') {
      description = variantOf(baseDescription, suggestion.variant);
    }
    if (suggestion.intensityScale !== 1) {
      description = scaleTargets(description, suggestion.intensityScale);
    }

    // Clé unique pour grouper : (date, description)
    const key = JSON.stringify({ date: suggestion.date, description });

    if (!groups.has(key)) {
      groups.set(key, { date: suggestion.date, description, athleteIds: [], variant: suggestion.variant });
    }

    groups.get(key)!.athleteIds.push(suggestion.athleteId);
  }

  return Array.from(groups.values());
}
