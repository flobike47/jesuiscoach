import { Avatar } from '@/components/ios';
import type { AthleteSummary } from '@/types';

/**
 * Sélecteur d'athlète en avatars horizontaux défilants (44 px, nom dessous).
 * Coach seulement ; rôle="radiogroup" pour l'accessibilité.
 */
export function AthletePicker({ athletes, picked, onPick }: { athletes: AthleteSummary[]; picked: string | null; onPick: (id: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        margin: '0 -16px',
        padding: '4px 16px',
        overflow: 'auto',
        scrollBehavior: 'smooth',
      }}
      role="radiogroup"
      aria-label="Athlète"
    >
      {athletes.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={a.id === picked}
          onClick={() => onPick(a.id)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-1)',
            minWidth: 'max-content',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: a.id === picked ? 'var(--label)' : 'var(--label-2)',
            fontSize: 12,
            fontWeight: a.id === picked ? 600 : 400,
          }}
        >
          <span
            style={{
              position: 'relative',
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Avatar name={a.name} size={44} />
            {a.id === picked && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  boxShadow: '0 0 0 2px var(--bg), 0 0 0 4px var(--tint)',
                }}
                aria-hidden
              />
            )}
          </span>
          <span style={{ maxWidth: 52, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{a.name}</span>
        </button>
      ))}
    </div>
  );
}
