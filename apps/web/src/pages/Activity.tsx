import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Avatar, Page, Placeholder, Segmented } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { useFeed } from '@/hooks/useCoach';
import { formatDuration, formatKm, relativeDay } from '@/lib/format';
import type { FeedItem } from '@/types';

type Filter = 'all' | 'planned' | 'unplanned';

/** Écran 3 : fil d'activité de l'équipe (sorties des 7 derniers jours). */
export default function Activity() {
  const { data, isLoading, error } = useFeed();
  const [filter, setFilter] = useState<Filter>('all');

  const groups = useMemo(() => {
    const items = (data?.items ?? []).filter((i) =>
      filter === 'all' ? true : filter === 'planned' ? i.plannedName !== null : i.plannedName === null,
    );
    const byDay = new Map<string, FeedItem[]>();
    for (const i of items) {
      const day = i.activity.start_date_local.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), i]);
    }
    return [...byDay.entries()];
  }, [data, filter]);

  return (
    <Page title="Activité">
      <Segmented<Filter>
        label="Filtrer les sorties"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Toutes' },
          { value: 'planned', label: 'Prévues' },
          { value: 'unplanned', label: 'Hors plan' },
        ]}
      />
      {isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}
      {error && <Placeholder title="Fil indisponible">{error.message}</Placeholder>}
      {data && groups.length === 0 && <Placeholder title="Aucune sortie">Rien sur les 7 derniers jours pour ce filtre.</Placeholder>}

      {groups.map(([day, items]) => (
        <section key={day}>
          <h2 className="section-header">{relativeDay(`${day}T12:00:00`)}</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((i) => (
              <FeedCard key={`${i.athleteId}-${i.activity.id}`} item={i} />
            ))}
          </div>
        </section>
      ))}
    </Page>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const a = item.activity;
  return (
    <Link to={`/athletes/${encodeURIComponent(item.athleteId)}`} className="card pressable" style={{ display: 'block', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={item.athleteName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="headline" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.name ?? 'Sortie'}
          </div>
          <div className="footnote secondary">
            {item.athleteName} · {dayjs(a.start_date_local).format('HH:mm')}
            {item.plannedName ? ' · séance prévue' : ' · hors plan'}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 }} className="tabular-nums">
        <Stat label="Durée" value={formatDuration(a.moving_time)} />
        <Stat label="Distance" value={formatKm(a.distance)} />
        <Stat label="P. pondérée" value={a.icu_weighted_avg_watts ? `${a.icu_weighted_avg_watts} W` : '–'} />
        <Stat label="Charge" value={a.icu_training_load != null ? String(a.icu_training_load) : '–'} />
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="caption secondary">{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
