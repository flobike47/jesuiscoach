/**
 * Lien vers la fiche d'une sortie, avec l'écran de retour (ex. le calendrier) passé
 * dans l'état de navigation : la fiche revient d'où l'on vient, pas vers « Progrès ».
 */
export interface BackTarget {
  to: string;
  label: string;
}

export const activityPath = (athleteId: string, activityId: string) => `/athletes/${encodeURIComponent(athleteId)}/sorties/${encodeURIComponent(activityId)}`;

/** État de navigation « revenir ici » : chemin + requête de l'écran courant. */
export const backState = (location: { pathname: string; search: string }, label: string): { back: BackTarget } => ({
  back: { to: `${location.pathname}${location.search}`, label },
});

/** Lit un retour valide dans l'état de navigation : chemin interne uniquement (pas d'URL externe ni « //hôte »). */
export function readBack(state: unknown): BackTarget | null {
  const back = (state as { back?: Partial<BackTarget> } | null)?.back;
  if (!back || typeof back.to !== 'string' || typeof back.label !== 'string') return null;
  if (!back.to.startsWith('/') || back.to.startsWith('//')) return null;
  return { to: back.to, label: back.label };
}
