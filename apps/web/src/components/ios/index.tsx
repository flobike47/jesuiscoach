import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Circle, X, Diamond, AlertTriangle } from 'lucide-react';
import { useSheetDrag } from '@/hooks/useSheetDrag';
import { usePrefersReducedMotion } from '@/components/common/usePrefersReducedMotion';
import { formZone, gaugePosition } from '@/lib/form';
import { signed } from '@/lib/format';
import { METRIC_COLORS } from '@/theme';

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

/* ---------- Badge de statut ---------- */

type StatusType = 'done' | 'planned' | 'missed' | 'extra' | 'watch';

const STATUS_SPECS: Record<StatusType, { icon: ReactNode; label: string; color: string; bg: string }> = {
  done: {
    label: 'Faite',
    color: 'var(--green)',
    bg: 'color-mix(in srgb, var(--green) 16%, transparent)',
    icon: <Check size={12} strokeWidth={3.2} aria-hidden />,
  },
  planned: {
    label: 'Prévue',
    color: 'var(--blue)',
    bg: 'color-mix(in srgb, var(--blue) 16%, transparent)',
    icon: <Circle size={11} strokeWidth={3} aria-hidden />,
  },
  missed: {
    label: 'Manquée',
    color: 'var(--red)',
    bg: 'color-mix(in srgb, var(--red) 16%, transparent)',
    icon: <X size={11} strokeWidth={3.2} aria-hidden />,
  },
  extra: {
    label: 'Hors plan',
    color: 'var(--label-2)',
    bg: 'var(--fill-2)',
    icon: <Diamond size={11} strokeWidth={3} aria-hidden />,
  },
  watch: {
    label: 'À surveiller',
    color: 'var(--orange)',
    bg: 'color-mix(in srgb, var(--orange) 16%, transparent)',
    icon: <AlertTriangle size={12} strokeWidth={2.6} aria-hidden />,
  },
};

export function StatusBadge({ status }: { status: StatusType }) {
  const spec = STATUS_SPECS[status];
  return (
    <span
      className="status-badge"
      style={{
        color: spec.color,
        background: spec.bg,
      }}
    >
      {spec.icon}
      {spec.label}
    </span>
  );
}

/* ---------- Grille de métriques ---------- */

export function MetricGrid({ items }: { items: Array<{ label: string; value: ReactNode; color?: string }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 8px' }}>
      {items.map((item, i) => (
        <div key={i}>
          <div className="caption secondary">{item.label}</div>
          <div className="metric" style={{ color: item.color }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Squelettes de chargement ---------- */

export function Skeleton({ width, height, radius = 6 }: { width?: string | number; height?: string | number; radius?: number }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div
      style={{
        background: 'var(--fill)',
        borderRadius: `${radius}px`,
        width,
        height,
        animation: reducedMotion ? undefined : 'pulse 2s ease-in-out infinite',
      }}
    />
  );
}

export function SkeletonList({ rows = 4, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {avatar && <Skeleton width={36} height={36} radius={50} />}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="70%" height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Jauge de forme ---------- */

export function FormGauge({
  form,
  fitness,
  fatigue,
  audience = 'coach',
}: {
  form: number;
  fitness: number;
  fatigue: number;
  audience?: 'coach' | 'athlete';
}) {
  const zone = formZone(form);
  const position = gaugePosition(form);

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Mot d'état en couleur */}
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: zone.color,
          marginBottom: 10,
        }}
      >
        {audience === 'coach' ? zone.label : zone.athleteLabel}
      </div>

      {/* Phrase de conseil */}
      <p style={{ fontSize: 13, lineHeight: 1.45, margin: '0 0 12px', color: 'var(--label-2)' }}>
        {zone.advice}
      </p>

      {/* Jauge avec segments et curseur */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1.6fr 1fr 1.3fr 0.9fr',
          gap: '3px',
          height: 8,
          marginBottom: 6,
          position: 'relative',
        }}
        role="img"
        aria-label={`Forme ${form} : ${zone.label}`}
      >
        {/* Segments de couleur */}
        {(['var(--red)', 'var(--green)', 'var(--gray)', 'var(--blue)', 'var(--yellow)'] as const).map((color, i) => (
          <span
            key={i}
            style={{
              background: color,
              borderRadius: i === 0 ? '4px 2px 2px 4px' : i === 4 ? '2px 4px 4px 2px' : '2px',
            }}
          />
        ))}

        {/* Curseur blanc */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${position}%`,
            top: '-5px',
            width: 4,
            height: 18,
            borderRadius: 2,
            background: 'var(--label)',
            boxShadow: '0 0 0 2px var(--cell)',
            transform: 'translateX(-50%)',
          }}
        />
      </div>

      {/* Libellés des zones sous la jauge */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1.6fr 1fr 1.3fr 0.9fr',
          gap: '3px',
          marginBottom: 12,
          fontSize: 11,
          color: 'var(--label-2)',
        }}
      >
        <span>&lt; −30</span>
        <span>−30 à −10</span>
        <span>−10 à 5</span>
        <span>5 à 25</span>
        <span>&gt; 25</span>
      </div>

      {/* Métriques */}
      <MetricGrid
        items={[
          { label: 'Fitness', value: Math.round(fitness), color: METRIC_COLORS.fitness },
          { label: 'Fatigue', value: Math.round(fatigue), color: METRIC_COLORS.fatigue },
          { label: 'Forme', value: signed(form) },
        ]}
      />
    </div>
  );
}
