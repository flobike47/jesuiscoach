import dayjs from 'dayjs';

/** Durée en secondes → « 1:32 » (heures:minutes). */
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

/** Valeur signée : « +12 », « −34 » (vrai signe moins typographique). */
export function signed(n: number): string {
  const r = Math.round(n);
  if (r > 0) return `+${r}`;
  if (r < 0) return `−${Math.abs(r)}`;
  return '0';
}

/** « il y a 12 min », « hier », « mar. 24 nov. ». */
export function relativeDay(iso: string, now = dayjs()): string {
  const d = dayjs(iso);
  const days = now.startOf('day').diff(d.startOf('day'), 'day');
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return d.format('dddd');
  return d.format('ddd D MMM');
}

/** Couleur de la forme (fitness − fatigue). */
export function formColor(form: number): string {
  if (form < -30) return 'var(--red)';
  if (form < -10) return 'var(--orange)';
  if (form > 15) return 'var(--blue)';
  return 'var(--green)';
}
