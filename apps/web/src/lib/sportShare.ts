/**
 * Répartition des sports pratiqués (logique pure) : nombre de sorties par
 * sport sur 4 semaines, en parts qui totalisent 100 %.
 */

export type SportGroup = 'Ride' | 'Run' | 'Swim' | 'Other';
/** Nombre de sorties par sport (réponse du BFF). */
export type SportCount = Record<SportGroup, number>;

/**
 * Ordre fixe et couleurs (variables CSS). Ordre choisi pour que deux couleurs
 * voisines restent distinctes, y compris pour un daltonien (palette vérifiée
 * en clair et en sombre) ; « Autre » reste gris, volontairement neutre.
 */
export const SPORT_ORDER: ReadonlyArray<{ key: SportGroup; label: string; color: string }> = [
  { key: 'Ride', label: 'Vélo', color: 'var(--blue)' },
  { key: 'Swim', label: 'Natation', color: 'var(--teal)' },
  { key: 'Run', label: 'Course', color: 'var(--orange)' },
  { key: 'Other', label: 'Autre', color: 'var(--gray)' },
];

export interface SportShare {
  key: SportGroup;
  label: string;
  color: string;
  /** Nombre de sorties. */
  count: number;
  /** Part entière en %, la somme des parts non nulles vaut 100. */
  percent: number;
}

export const totalCount = (t: SportCount): number => SPORT_ORDER.reduce((s, x) => s + Math.max(0, t[x.key] || 0), 0);

/** Parts de chaque sport pratiqué (les sports à 0 sont omis), arrondies au plus fort reste. */
export function sportShares(t: SportCount): SportShare[] {
  const total = totalCount(t);
  if (total <= 0) return [];
  const rows = SPORT_ORDER.filter((s) => (t[s.key] || 0) > 0).map((s) => {
    const exact = ((t[s.key] || 0) / total) * 100;
    return { ...s, count: t[s.key], percent: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let missing = 100 - rows.reduce((s, r) => s + r.percent, 0);
  for (const r of [...rows].sort((a, b) => b.rest - a.rest)) {
    if (missing <= 0) break;
    r.percent += 1;
    missing -= 1;
  }
  return rows.map(({ rest: _rest, ...r }) => r);
}

/** « 1 sortie », « 12 sorties », « 0 sortie ». */
export function formatCount(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `${v.toLocaleString('fr-FR')} sortie${v > 1 ? 's' : ''}`;
}

/** Phrase pour les lecteurs d'écran : « Vélo 80 %, Course 20 % ». */
export function sharesLabel(shares: SportShare[]): string {
  return shares.length === 0 ? 'Aucune sortie' : shares.map((s) => `${s.label} ${s.percent} %`).join(', ');
}
