import { ZONE_COLORS } from '@/theme';
import { formatHours } from '@/lib/format';

/** Barre horizontale du temps passé dans chaque zone (Z1…Z7). */
export function ZoneBar({ seconds }: { seconds: number[] }) {
  const total = seconds.reduce((s, v) => s + v, 0);
  const label = seconds
    .map((s, i) => (s > 0 ? `Z${i + 1} ${formatHours(s)}` : null))
    .filter(Boolean)
    .join(', ');
  return (
    <div role="img" aria-label={`Temps par zone : ${label}`} style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--fill)' }}>
      {total > 0 && seconds.map((s, i) => (s > 0 ? <span key={i} style={{ flex: s, background: ZONE_COLORS[i] }} /> : null))}
    </div>
  );
}
