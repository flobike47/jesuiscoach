import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSheetDrag } from '@/hooks/useSheetDrag';
import { usePrefersReducedMotion } from '@/components/common/usePrefersReducedMotion';

/**
 * Composants iOS de l'app (liste groupée, titre large, segmenté, anneau,
 * feuille). Styles dans styles.css ; principes dans .claude/skills/apple-design.
 */

/* ---------- Page à grand titre ---------- */

interface PageProps {
  title: string;
  /** Lien retour (« ‹ Équipe »). */
  back?: { to: string; label: string };
  actions?: ReactNode;
  /** Sous le grand titre (avatar, sous-titre…). */
  header?: ReactNode;
  children: ReactNode;
}

/**
 * Le grand titre défile avec le contenu ; quand il disparaît, le titre
 * compact apparaît dans la barre translucide (comme UINavigationBar).
 */
export function Page({ title, back, actions, header, children }: PageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: '-44px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="page">
      <div className={compact ? 'nav-bar compact' : 'nav-bar'} style={{ '--nav-title-opacity': compact ? 1 : 0 } as CSSProperties}>
        <div>
          {back && (
            <Link to={back.to} className="nav-back">
              <ChevronLeft size={26} strokeWidth={2.2} aria-hidden />
              {back.label}
            </Link>
          )}
        </div>
        <span className="nav-title" aria-hidden>
          {title}
        </span>
        <div className="nav-actions">{actions}</div>
      </div>
      <h1 ref={titleRef} className="large-title" style={{ margin: '4px 0 12px' }}>
        {title}
      </h1>
      {header}
      {children}
    </div>
  );
}

/* ---------- Liste groupée ---------- */

export function Section({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {header && <h2 className="section-header">{header}</h2>}
      <div className="group">{children}</div>
      {footer && <p className="section-footer">{footer}</p>}
    </section>
  );
}

interface CellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  leading?: ReactNode;
  to?: string;
  onClick?: () => void;
  chevron?: boolean;
  /** Alignement du séparateur avec le texte quand il y a un élément à gauche. */
  inset?: number;
}

export function Cell({ title, subtitle, detail, leading, to, onClick, chevron, inset }: CellProps) {
  const content = (
    <>
      {leading}
      <div className="cell-body">
        <div className="cell-title">{title}</div>
        {subtitle && <div className="cell-subtitle">{subtitle}</div>}
      </div>
      {detail && <div className="cell-detail">{detail}</div>}
      {(chevron ?? Boolean(to)) && <ChevronRight size={18} className="chevron" aria-hidden />}
    </>
  );
  const style = inset ? ({ '--separator-inset': `${inset}px` } as CSSProperties) : undefined;
  if (to) {
    return (
      <Link to={to} className="cell" style={{ ...style, color: 'inherit' }}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="cell" style={style} onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <div className="cell" style={style}>
      {content}
    </div>
  );
}

/* ---------- Contrôle segmenté ---------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      <span
        className="segmented-thumb"
        aria-hidden
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          // Bascule dès l'appui : la réponse n'attend pas le relâcher.
          onPointerDown={() => onChange(o.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Anneaux de progression ---------- */

export interface RingSpec {
  /** 0 → 1 (au-delà, l'anneau reste plein). */
  progress: number;
  color: string;
}

/** Anneaux concentriques façon app Forme. */
export function Rings({ rings, size = 76, stroke = 9, label }: { rings: RingSpec[]; size?: number; stroke?: number; label: string }) {
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      {rings.map((r, i) => {
        const radius = c - stroke / 2 - i * (stroke + 2);
        const len = 2 * Math.PI * radius;
        const p = Math.max(0, Math.min(1, r.progress));
        return (
          <g key={i} transform={`rotate(-90 ${c} ${c})`}>
            <circle cx={c} cy={c} r={radius} fill="none" stroke={r.color} strokeOpacity={0.22} strokeWidth={stroke} />
            <circle
              cx={c}
              cy={c}
              r={radius}
              fill="none"
              stroke={r.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={len * (1 - p)}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Avatar ---------- */

const AVATAR_COLORS = ['var(--blue)', 'var(--indigo)', 'var(--purple)', 'var(--orange)', 'var(--teal)', 'var(--green)', 'var(--pink)'];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </span>
  );
}

/* ---------- Feuille ---------- */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Action principale à droite de l'en-tête (« Envoyer »). */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * Feuille modale qui monte du bas, avec poignée. Se ferme en la tirant vers
 * le bas (élan projeté, lib/sheetGesture.ts), par « Annuler », Échap ou le fond.
 */
export function Sheet({ open, onClose, title, action, children }: SheetProps) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  useSheetDrag(node, { open, onDismiss: onClose, reducedMotion });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-scrim" data-sheet-scrim onClick={onClose} />
      <div ref={setNode} className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="sheet-grabber" aria-hidden />
        <div className="sheet-header">
          <button type="button" onClick={onClose} style={{ color: 'var(--tint)', justifySelf: 'start', minHeight: 44 }}>
            Annuler
          </button>
          <span className="headline">{title}</span>
          <div>{action}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}

/* ---------- États vides / erreurs ---------- */

export function Placeholder({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--label-2)' }}>
      <p className="headline" style={{ color: 'var(--label)', margin: '0 0 6px' }}>
        {title}
      </p>
      {children && <p className="footnote" style={{ margin: 0 }}>{children}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
