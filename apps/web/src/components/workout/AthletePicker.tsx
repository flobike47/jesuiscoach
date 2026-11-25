import { Avatar, Cell } from '@/components/ios';
import type { AthleteSummary } from '@/types';

/** Sélection d'athlètes de l'équipe (cases à cocher façon iOS, « Tous / Aucun »). */
export function AthletePicker({
  athletes,
  selected,
  onChange,
}: {
  athletes: AthleteSummary[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const all = selected.size === athletes.length && athletes.length > 0;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <>
      <h3 className="section-header">
        Athlètes{' '}
        <button type="button" style={{ float: 'right', color: 'var(--tint)', textTransform: 'none' }} onClick={() => onChange(all ? new Set() : new Set(athletes.map((a) => a.id)))}>
          {all ? 'Aucun' : 'Tous'}
        </button>
      </h3>
      <div className="group">
        {athletes.map((a) => (
          <Cell
            key={a.id}
            onClick={() => toggle(a.id)}
            inset={64}
            leading={<Avatar name={a.name} />}
            title={a.name}
            subtitle={a.ftp ? `FTP ${a.ftp} W` : undefined}
            detail={
              <span
                role="checkbox"
                aria-checked={selected.has(a.id)}
                aria-label={a.name}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: selected.has(a.id) ? 'none' : '1.5px solid var(--label-3)',
                  background: selected.has(a.id) ? 'var(--tint)' : 'transparent',
                  color: '#fff',
                  fontSize: 14,
                }}
              >
                {selected.has(a.id) ? '✓' : ''}
              </span>
            }
          />
        ))}
      </div>
    </>
  );
}
