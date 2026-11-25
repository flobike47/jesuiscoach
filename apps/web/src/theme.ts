import type { DocumentTheme } from './lib/documentTheme';

/**
 * Thème de l'app. Les couleurs vivent en variables CSS (styles.css, couleurs
 * système iOS clair / sombre) ; ici seulement ce qui doit sortir du CSS :
 * barre d'état, fond du body pendant le rebond de défilement.
 */
export type ThemeMode = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

export const DOCUMENT_COLORS: Record<ResolvedTheme, Omit<DocumentTheme, 'mode'>> = {
  dark: { themeColor: '#000000', background: '#000000', borderSecondary: 'rgba(84, 84, 88, 0.65)' },
  light: { themeColor: '#f2f2f7', background: '#f2f2f7', borderSecondary: 'rgba(60, 60, 67, 0.29)' },
};

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

export function documentThemeFor(theme: ResolvedTheme): DocumentTheme {
  return { mode: theme, ...DOCUMENT_COLORS[theme] };
}

/** Couleurs fixes des indicateurs (les mêmes partout : graphiques, chiffres, légendes). */
/** Couleurs des zones Z1…Z7 (mêmes conventions qu'Intervals.icu : gris → violet). */
export const ZONE_COLORS = ['var(--gray)', 'var(--blue)', 'var(--green)', 'var(--yellow)', 'var(--orange)', 'var(--red)', 'var(--purple)'] as const;

export const METRIC_COLORS = {
  fitness: 'var(--blue)',
  fatigue: 'var(--pink)',
  form: 'var(--yellow)',
} as const;
