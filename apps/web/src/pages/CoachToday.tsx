import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Page, Placeholder, Section, SkeletonList, StatusBadge } from '@/components/ios';
import { useTeam } from '@/hooks/useCoach';
import { useTeamToday } from '@/hooks/useCalendarData';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullIndicator } from '@/components/common/PullIndicator';
import { WeekReviewCard } from '@/components/coach/WeekReviewCard';
import { formatDuration, formatLoad } from '@/lib/format';
import { todayCounts } from '@/lib/today';
import type { AthleteSummary } from '@/types';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function alertOf(athlete: AthleteSummary) {
  if (!athlete.alerts.length) return null;
  const high = athlete.alerts.find((a) => a.level === 'high');
  return high || athlete.alerts[0];
}

/** Accueil du coach : vue sur la journée de l'équipe. */
export default function CoachToday() {
  const today = dayjs();
  const dateStr = today.format('YYYY-MM-DD');
  const { data: teamData } = useTeam();
  const { data: todayData, isLoading: todayLoading, error: todayError, refetch: refetchToday } = useTeamToday(dateStr);
  const queryClient = useQueryClient();

  const { pullPosition, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team'] }),
        queryClient.invalidateQueries({ queryKey: ['team-today', dateStr] }),
      ]);
    },
  });

  const toWatch = useMemo(() => {
    if (!teamData?.athletes) return [];
    return teamData.athletes
      .filter((a) => a.alerts.some((x) => x.level === 'high') || a.alerts.some((x) => x.code === 'inactive'))
      .sort((a, b) => {
        const aAlert = alertOf(a);
        const bAlert = alertOf(b);
        if (aAlert?.level === 'high' && bAlert?.level !== 'high') return -1;
        if (aAlert?.level !== 'high' && bAlert?.level === 'high') return 1;
        return 0;
      });
  }, [teamData?.athletes]);

  const athletes = useMemo(() => todayData?.athletes ?? [], [todayData?.athletes]);
  const counts = useMemo(() => todayCounts(athletes), [athletes]);
  const dateFmt = capitalize(today.format('dddd D MMMM'));

  if (todayLoading) {
    return (
      <Page title="Aujourd'hui" account header={<p className="footnote secondary" style={{ margin: '-8px 0 12px' }}>{dateFmt}</p>}>
        <SkeletonList rows={6} avatar={false} />
      </Page>
    );
  }

  if (todayError) {
    return (
      <Page title="Aujourd'hui" account header={<p className="footnote secondary" style={{ margin: '-8px 0 12px' }}>{dateFmt}</p>}>
        <Placeholder
          title="Données indisponibles"
          action={<button type="button" className="button tinted pressable" onClick={() => refetchToday()}>Réessayer</button>}
        >
          {todayError.message}
        </Placeholder>
      </Page>
    );
  }

  return (
    <>
      <PullIndicator pullPosition={pullPosition} isRefreshing={isRefreshing} />
      <Page title="Aujourd'hui" account header={<p className="footnote secondary" style={{ margin: '-8px 0 12px' }}>{dateFmt} · mis à jour {today.format('HH:mm')}</p>}>
      {/* 3 tuiles compactes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: 16 }}>
        <div className="card" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--orange)', fontVariantNumeric: 'tabular-nums' }}>
            {toWatch.length}
          </div>
          <div style={{ fontSize: 13, color: 'var(--label-2)', marginTop: 4 }}>à traiter</div>
        </div>
        <div className="card" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
            {counts.totalWorkouts ? counts.doneWorkouts : counts.ridesToday}
            {counts.totalWorkouts > 0 && <span style={{ fontSize: 17, color: 'var(--label-2)', fontWeight: 600 }}>/{counts.totalWorkouts}</span>}
          </div>
          {/* Sans séance prévue aujourd'hui, on compte les sorties : « 0/0 » ne dit rien. */}
          <div style={{ fontSize: 13, color: 'var(--label-2)', marginTop: 4 }}>{counts.totalWorkouts ? 'séances faites' : 'sorties du jour'}</div>
        </div>
        <div className="card" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>
            {counts.stillPlanned}
          </div>
          <div style={{ fontSize: 13, color: 'var(--label-2)', marginTop: 4 }}>encore prévues</div>
        </div>
      </div>

      {/* Bilan de la semaine écoulée (lundi matin) */}
      <WeekReviewCard today={dateStr} />

      {/* À traiter */}
      {toWatch.length > 0 && (
        <section>
          <h2 className="section-header">À traiter · {toWatch.length}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {toWatch.map((athlete) => {
              const alert = alertOf(athlete);
              return (
                <div key={athlete.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={athlete.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{athlete.name}</div>
                    </div>
                    {alert && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 7px',
                          borderRadius: 6,
                          whiteSpace: 'nowrap',
                          color: alert.level === 'high' ? 'var(--red)' : 'var(--orange)',
                          background: alert.level === 'high' ? 'color-mix(in srgb, var(--red) 16%, transparent)' : 'color-mix(in srgb, var(--orange) 16%, transparent)',
                        }}
                      >
                        {alert.code === 'ramp' && 'Surcharge'}
                        {alert.code === 'inactive' && 'Inactif'}
                        {alert.code === 'missed' && 'Manquées'}
                        {alert.code === 'fatigue' && 'Fatigué'}
                      </div>
                    )}
                  </div>
                  {alert?.text && (
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: 'var(--label-2)' }}>
                      {alert.text}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link
                      to={`/calendrier?athlete=${encodeURIComponent(athlete.id)}`}
                      className="button tinted pressable"
                      style={{ minHeight: 36, borderRadius: 18, padding: '0 14px', fontSize: 15 }}
                    >
                      Planifier
                    </Link>
                    <Link
                      to={`/athletes/${encodeURIComponent(athlete.id)}`}
                      style={{ minHeight: 36, borderRadius: 18, padding: '0 14px', fontSize: 15, color: 'var(--blue)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                    >
                      Voir la fiche
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Équipe aujourd'hui */}
      {athletes.length > 0 && (
        <Section header={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>L'équipe aujourd'hui</span><Link to="/activite" style={{ fontSize: 15, letterSpacing: '-0.01em', textTransform: 'none' }}>Tout le fil</Link></div>}>
          <div className="group">
            {athletes.map((athlete) => {
                  const activity = athlete.done[0];
                  const planned = athlete.planned[0];
                  const isActivityDone = activity != null;
                  const href = isActivityDone ? `/athletes/${encodeURIComponent(athlete.id)}/sorties/${encodeURIComponent(activity.id)}` : `/athletes/${encodeURIComponent(athlete.id)}`;

                  // Statut calculé par le serveur (séances prévues appariées aux sorties) : une seule vérité.
                  const status = athlete.status === 'rest' || !athlete.status ? null : athlete.status;
                  const describe = (a: { name: string | null; moving_time: number | null; icu_training_load: number | null }) =>
                    [a.name, a.moving_time ? formatDuration(a.moving_time) : null, a.icu_training_load ? `charge ${formatLoad(a.icu_training_load)}` : null].filter(Boolean).join(' · ');
                  const subtitle = activity
                    ? describe(activity)
                    : planned
                      ? [planned.name ?? 'Séance', planned.start_date_local?.slice(11, 16) !== '00:00' ? planned.start_date_local?.slice(11, 16) : null].filter(Boolean).join(' · ')
                      : 'Repos';

                  return (
                    <Link
                      key={athlete.id}
                      to={href}
                      className="cell"
                      style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}
                    >
                      <Avatar name={athlete.name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{athlete.name}</div>
                        {subtitle && <div className="footnote secondary">{subtitle}</div>}
                      </div>
                      {status && <StatusBadge status={status} />}
                    </Link>
                  );
                })}
            </div>
          </Section>
        )}
    </Page>
    </>
  );
}
