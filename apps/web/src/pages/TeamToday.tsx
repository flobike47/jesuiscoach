import { useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar, Cell, Page, Placeholder, Section } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { useTeamToday } from '@/hooks/useCalendarData';
import { formatDuration } from '@/lib/format';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/calendar';
import type { TeamDayAthlete } from '@/services/calendarApi';

/** Vue « Aujourd'hui » du coach : séances prévues, sorties faites et statut de toute l'équipe. */
export default function TeamToday() {
  const [day, setDay] = useState(() => dayjs());
  const date = day.format('YYYY-MM-DD');
  const { data, isLoading, error, refetch } = useTeamToday(date);
  const isToday = date === dayjs().format('YYYY-MM-DD');
  const athletes = [...(data?.athletes ?? [])].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'fr'));

  return (
    <Page title="Aujourd’hui" back={{ to: '/', label: 'Équipe' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' }}>
        <button type="button" aria-label="Jour précédent" onClick={() => setDay((d) => d.subtract(1, 'day'))} style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}>
          <ChevronLeft size={24} />
        </button>
        <span className="headline">
          {day.format('dddd D MMMM')}
          {isToday ? ' · aujourd’hui' : ''}
        </span>
        <button type="button" aria-label="Jour suivant" onClick={() => setDay((d) => d.add(1, 'day'))} style={{ color: 'var(--tint)', minWidth: 44, minHeight: 44 }}>
          <ChevronRight size={24} />
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}
      {error && (
        <Placeholder title="Journée indisponible" action={<button type="button" className="button tinted pressable" onClick={() => refetch()}>Réessayer</button>}>
          {(error as Error).message}
        </Placeholder>
      )}
      {data && athletes.length === 0 && <Placeholder title="Personne dans l’équipe" />}

      {athletes.length > 0 && (
        <Section footer={athletes.some((a) => a.error) ? 'Un ou plusieurs athlètes n’ont pas pu être lus : Intervals.icu à vérifier.' : undefined}>
          {athletes.map((a) => (
            <AthleteDay key={a.id} a={a} />
          ))}
        </Section>
      )}
    </Page>
  );
}

/** Tri : à surveiller d'abord (manqué, hors plan), puis le reste. */
function order(a: TeamDayAthlete): number {
  if (a.error) return 0;
  if (a.status === 'missed') return 1;
  if (a.status === 'extra') return 2;
  if (a.status === 'planned') return 3;
  if (a.status === 'done') return 4;
  return 5;
}

function AthleteDay({ a }: { a: TeamDayAthlete }) {
  const workouts = a.planned.filter((e) => e.category === 'WORKOUT');
  const subtitle = [
    workouts.length ? workouts.map((e) => e.name ?? 'Séance').join(', ') : 'Rien de prévu',
    a.done.length ? a.done.map((d) => `${formatDuration(d.moving_time)}${d.icu_training_load != null ? ` · charge ${Math.round(d.icu_training_load)}` : ''}`).join(' · ') : null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <Cell
      to={`/athletes/${encodeURIComponent(a.id)}`}
      inset={64}
      leading={<Avatar name={a.name} size={36} />}
      title={a.name}
      subtitle={a.error ? `Lecture impossible : ${a.error}` : subtitle}
      detail={
        a.error || !a.status ? (
          <span style={{ color: 'var(--red)', fontSize: 13 }}>Erreur</span>
        ) : (
          <span style={{ color: STATUS_COLOR[a.status], fontWeight: 600, fontSize: 13 }}>{STATUS_LABEL[a.status]}</span>
        )
      }
    />
  );
}
