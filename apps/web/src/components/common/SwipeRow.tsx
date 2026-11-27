import { useRef, useState, type ReactNode } from 'react';

const ACTION_WIDTH = 104;
/** Distance à partir de laquelle la ligne reste ouverte au relâcher. */
const OPEN_AT = ACTION_WIDTH / 2;
/** Mouvement minimal avant de considérer le geste comme horizontal. */
const SLOP = 10;

/**
 * Ligne qui se glisse vers la gauche pour révéler une action (comme Mail
 * sur iOS) : suit le doigt 1:1, résiste au-delà de l'action, s'ouvre ou se
 * referme au relâcher selon la distance. Le défilement vertical reste libre
 * (touch-action: pan-y). Au clavier, l'action se dévoile en prenant le focus.
 */
export function SwipeRow({ children, actionLabel, onAction }: { children: ReactNode; actionLabel: string; onAction: () => void }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ px: number; py: number; x: number; horizontal: boolean | null } | null>(null);
  /**
   * Vrai après un glissé horizontal, jusqu'au prochain appui : à la souris,
   * le navigateur envoie un clic au relâcher, qu'il faut ignorer (sinon la
   * ligne qu'on vient d'ouvrir se referme aussitôt). Au doigt, aucun clic ne
   * suit un glissé ; la remise à zéro au prochain appui suffit.
   */
  const dragged = useRef(false);

  const onDown = (e: React.PointerEvent) => {
    dragged.current = false;
    start.current = { px: e.clientX, py: e.clientY, x, horizontal: null };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (s.horizontal == null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      s.horizontal = Math.abs(dx) > Math.abs(dy);
      if (s.horizontal) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragged.current = true;
        setDragging(true);
      }
    }
    if (!s.horizontal) return;
    const raw = Math.min(0, s.x + dx);
    // Résistance au-delà de la largeur de l'action.
    setX(raw < -ACTION_WIDTH ? -ACTION_WIDTH + (raw + ACTION_WIDTH) * 0.3 : raw);
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (s?.horizontal) setX((v) => (v < -OPEN_AT ? -ACTION_WIDTH : 0));
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => {
          setX(0);
          onAction();
        }}
        // Au clavier, l'action cachée sous la ligne se dévoile quand elle prend le focus.
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible')) setX(-ACTION_WIDTH);
        }}
        onBlur={() => setX(0)}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: ACTION_WIDTH, background: 'var(--tint)', color: '#fff', fontWeight: 600, fontSize: 15 }}
      >
        {actionLabel}
      </button>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClickCapture={(e) => {
          if (dragged.current) {
            // Clic émis par le relâcher d'un glissé : ni ouvrir la séance, ni refermer.
            dragged.current = false;
            e.stopPropagation();
            e.preventDefault();
          } else if (x !== 0) {
            // Un tap sur une ligne ouverte la referme au lieu d'ouvrir la séance.
            e.stopPropagation();
            e.preventDefault();
            setX(0);
          }
        }}
        style={{ position: 'relative', background: 'var(--cell)', transform: `translateX(${x}px)`, transition: dragging ? 'none' : 'transform 280ms var(--ease-ios)', touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </div>
  );
}
