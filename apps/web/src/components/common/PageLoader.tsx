/**
 * Indicateur de chargement plein écran : session en cours de lecture ou
 * premier chargement d'une route lazy (avant que le layout n'existe).
 */
export function PageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', background: 'var(--bg)' }}>
      <Spinner />
    </div>
  );
}

/** Indicateur d’activité iOS (8 rayons). */
export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Chargement" className="spinner">
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1="12"
          y1="3"
          x2="12"
          y2="7.5"
          stroke="var(--label-2)"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity={0.25 + (i / 8) * 0.75}
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
      <style>{`.spinner{animation:spin 0.8s steps(8) infinite}@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){.spinner{animation-duration:2.4s}}`}</style>
    </svg>
  );
}
