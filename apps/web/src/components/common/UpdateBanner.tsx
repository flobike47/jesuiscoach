import { useUpdateAvailable } from '@/hooks/useUpdateAvailable';

/**
 * Bandeau « mise à jour disponible ». Jamais de rechargement automatique :
 * il ferait perdre une séance en cours d'édition.
 */
export function UpdateBanner() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <aside role="status" aria-label="Mise à jour disponible" className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
      <p style={{ margin: 0, flex: 1 }} className="footnote">
        Une mise à jour est disponible.
      </p>
      <button type="button" className="pill" style={{ color: 'var(--tint)', fontSize: 15, minHeight: 44 }} onClick={() => window.location.reload()}>
        Recharger
      </button>
    </aside>
  );
}
