/** Formats lisibles pour les notifications (mêmes règles que apps/web/src/lib/format.ts). */

/** Durée en secondes → « 1:32 ». */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '–';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m === 60 ? `${h + 1}:00` : `${h}:${String(m).padStart(2, '0')}`;
}

/** Distance en mètres → « 48 km ». */
export function formatKm(meters: number | null | undefined): string {
  return meters ? `${Math.round(meters / 1000)} km` : '–';
}
