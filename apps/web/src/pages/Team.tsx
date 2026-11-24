import { useMemo, useState } from 'react';
import { Avatar, Cell, Page, Placeholder, Rings, Section } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { useTeam } from '@/hooks/useCoach';
import type { AthleteSummary } from '@/types';
import { signed } from '@/lib/format';

/** Écran 1 : l'équipe, avec en tête ceux qu'il faut surveiller. */
export default function Team() {
  const { data, isLoading, error, refetch } = useTeam();
  const [query, setQuery] = useState('');
  const athletes = useMemo(
    () => (data?.athletes ?? []).filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase())),
    [data, query],
  );
  const watch = athletes.filter((a) => a.alerts.some((x) => x.level === 'high') || a.alerts.some((x) => x.code === 'inactive'));
  const others = athletes.filter((a) => !watch.includes(a)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const all = data?.athletes ?? [];
  const rides = all.reduce((s, a) => s + a.plannedDone, 0);
  const planned = all.reduce((s, a) => s + a.plannedTotal, 0);
  const active = all.filter((a) => a.daysSinceRide != null && a.daysSinceRide < 7).length;

  return (
    <Page title="Équipe">
      <input
        type="search"
        className="field"
        placeholder="Rechercher"
        aria-label="Rechercher un athlète"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ background: 'var(--fill)', borderRadius: 10, minHeight: 36, padding: '7px 12px' }}
      />

      {isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}
      {error && (
        <Placeholder title="Équipe indisponible" action={<button type="button" className="button tinted pressable" onClick={() => refetch()}>Réessayer</button>}>
          {error.message}
        </Placeholder>
      )}

      {data && (
        <>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
            <Rings
              label={`${active} athlètes actifs sur ${all.length}, ${rides} séances faites sur ${planned}`}
              rings={[
                { progress: all.length ? active / all.length : 0, color: 'var(--pink)' },
                { progress: planned ? rides / planned : 0, color: 'var(--green)' },
              ]}
            />
            <div className="footnote" style={{ lineHeight: 1.5 }}>
              <div className="secondary">7 derniers jours</div>
              <div>
                <span className="metric" style={{ color: 'var(--pink)' }}>{active}</span>
                <span className="secondary">/{all.length} ont roulé</span>
              </div>
              <div>
                <span className="metric" style={{ color: 'var(--green)' }}>{planned ? Math.round((rides / planned) * 100) : 0} %</span>
                <span className="secondary"> séances faites</span>
              </div>
            </div>
          </div>

          {watch.length > 0 && (
            <Section header={`À surveiller · ${watch.length}`}>
              {watch.map((a) => (
                <AthleteRow key={a.id} athlete={a} watch />
              ))}
            </Section>
          )}
          <Section header="Tous" footer={data.errors.length ? `${data.errors.length} athlète(s) indisponible(s) : connexion Intervals.icu à refaire.` : undefined}>
            {others.map((a) => (
              <AthleteRow key={a.id} athlete={a} />
            ))}
            {others.length === 0 && <Cell title={<span className="secondary">Personne</span>} />}
          </Section>
        </>
      )}
    </Page>
  );
}

function AthleteRow({ athlete: a, watch }: { athlete: AthleteSummary; watch?: boolean }) {
  const first = a.alerts[0];
  const subtitle = watch && first ? (
    <span style={{ color: first.level === 'high' ? 'var(--red)' : 'var(--orange)' }}>{first.text}</span>
  ) : (
    <span className="tabular-nums">
      Fitness {Math.round(a.fitness)} · forme {signed(a.form)} · {a.weekHours.toLocaleString('fr-FR')} h
    </span>
  );
  const compliance = a.plannedTotal ? `${a.plannedDone}/${a.plannedTotal}` : undefined;
  return (
    <Cell
      to={`/athletes/${encodeURIComponent(a.id)}`}
      leading={<Avatar name={a.name} />}
      inset={64}
      title={a.name}
      subtitle={subtitle}
      detail={
        compliance && (
          <span style={{ color: a.plannedDone === a.plannedTotal ? 'var(--green)' : 'var(--orange)' }} aria-label={`${compliance} séances faites`}>
            {compliance}
          </span>
        )
      }
    />
  );
}
