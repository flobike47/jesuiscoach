import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { AlertTriangle, BarChart3, Clock, TrendingUp, UserRound, Zap } from 'lucide-react';
import { Avatar, Cell, Page, Placeholder, Section, Segmented, FormGauge, SkeletonList } from '@/components/ios';
import { useAthleteOverview } from '@/hooks/useCoach';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullIndicator } from '@/components/common/PullIndicator';
import { formatDuration, formatKm, relativeDay, formatLoad } from '@/lib/format';
import { METRIC_COLORS } from '@/theme';
import type { SeriesPoint } from '@/types';

type Range = '30' | '90';

const FEELING_LABELS = ['Très mal', 'Fatigué', 'Correct', 'Bien', 'En pleine forme'];

/** Écran 4 (coach) : fiche d'un athlète de l'équipe. */
export default function Athlete() {
  const { id } = useParams();
  return <AthleteView id={id} back={{ to: '/', label: 'Équipe' }} />;
}

/** Fiche athlète (forme sur 90 jours, alertes, ressentis, sorties récentes). */
export function AthleteView({ id, back, title, account }: { id: string | undefined; back?: { to: string; label: string }; title?: string; account?: boolean }) {
  const { data, isLoading, error } = useAthleteOverview(id);
  const [range, setRange] = useState<Range>('90');
  const name = data?.summary.name ?? 'Athlète';
  const queryClient = useQueryClient();

  const { pullPosition, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['athlete', id] });
    },
  });

  return (
    <>
      <PullIndicator pullPosition={pullPosition} isRefreshing={isRefreshing} />
      <Page
      title={title ?? name}
      back={back}
      account={account}
      header={
        data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Avatar name={name} size={48} />
            <div className="footnote secondary tabular-nums">
              FTP {data.summary.ftp ?? '–'} W · {data.summary.weekHours.toLocaleString('fr-FR')} h et {data.summary.weekKm} km sur 7 jours
            </div>
          </div>
        )
      }
    >
      {isLoading && <SkeletonList rows={4} />}
      {error && <Placeholder title="Fiche indisponible">{error.message}</Placeholder>}

      {data && (
        <>
          <div className="card">
            <FormGauge form={data.summary.form} fitness={data.summary.fitness} fatigue={data.summary.fatigue} audience="coach" />
          </div>

          <div className="card">
            <div style={{ margin: '0 0 8px' }}>
              <Segmented<Range>
                label="Période"
                value={range}
                onChange={setRange}
                options={[
                  { value: '30', label: '30 jours' },
                  { value: '90', label: '90 jours' },
                ]}
              />
            </div>
            <FormChart series={data.series.slice(range === '30' ? -30 : 0)} />
            <div className="caption secondary" style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 6 }}>
              <Legend color={METRIC_COLORS.fitness} label="Fitness" />
              <Legend color={METRIC_COLORS.fatigue} label="Fatigue" />
              <Legend color={METRIC_COLORS.form} label="Forme" />
            </div>
          </div>

          <Section header="Analyse">
            <Cell inset={52} leading={<UserRound size={20} color="var(--indigo)" aria-hidden />} title="Profil" subtitle="Physiologie, disponibilités, santé" to={`/athletes/${encodeURIComponent(id!)}/profil`} chevron />
            <Cell inset={52} leading={<Zap size={20} color="var(--blue)" aria-hidden />} title="Puissance" subtitle="Courbe, records, FTP estimée" to={`/athletes/${encodeURIComponent(id!)}/puissance`} chevron />
            <Cell inset={52} leading={<BarChart3 size={20} color="var(--green)" aria-hidden />} title="Zones" subtitle="Temps par zone, semaine par semaine" to={`/athletes/${encodeURIComponent(id!)}/zones`} chevron />
          </Section>

          {data.summary.alerts.length > 0 && (
            <Section header="Points d'attention">
              {data.summary.alerts.map((a) => {
                const Icon = a.code === 'ramp' ? TrendingUp : a.code === 'inactive' ? Clock : AlertTriangle;
                return (
                  <Cell
                    key={a.code}
                    inset={52}
                    leading={<Icon size={20} color={a.level === 'high' ? 'var(--red)' : 'var(--orange)'} aria-hidden />}
                    title={a.text}
                  />
                );
              })}
            </Section>
          )}

          {data.checkins.length > 0 && (
            <Section header="Ressenti">
              {data.checkins.slice(0, 5).map((c) => (
                <Cell
                  key={c.day}
                  title={`${FEELING_LABELS[c.feeling - 1]}${c.rpe != null ? ` · effort ${c.rpe}/10` : ''}`}
                  subtitle={c.note ?? undefined}
                  detail={relativeDay(`${c.day}T12:00:00`)}
                />
              ))}
            </Section>
          )}

          <Section header="Sorties des 30 derniers jours">
            {data.activities.length === 0 && <Cell title={<span className="secondary">Aucune sortie</span>} />}
            {data.activities.map((a) => (
              <Cell
                key={a.id}
                title={a.name ?? 'Sortie'}
                subtitle={
                  <span className="tabular-nums">
                    {relativeDay(a.start_date_local)} · {formatDuration(a.moving_time)} · {formatKm(a.distance)}
                    {a.icu_weighted_avg_watts ? ` · ${a.icu_weighted_avg_watts} W` : ''}
                  </span>
                }
                detail={formatLoad(a.icu_training_load) !== '–' ? <span aria-label={`Charge ${a.icu_training_load}`}>{formatLoad(a.icu_training_load)}</span> : undefined}
                to={`/athletes/${encodeURIComponent(id!)}/sorties/${encodeURIComponent(a.id)}`}
                chevron
              />
            ))}
          </Section>
          <p className="section-footer">Le chiffre à droite est la charge de la sortie.</p>
        </>
      )}
    </Page>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <span style={{ display: 'inline-block', width: 10, height: 3, borderRadius: 2, background: color, verticalAlign: 'middle', marginRight: 5 }} />
      {label}
    </span>
  );
}

function FormChart({ series }: { series: SeriesPoint[] }) {
  return (
    <div style={{ height: 180 }} role="img" aria-label="Courbe de fitness, fatigue et forme">
      <ResponsiveContainer>
        <LineChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--separator)" strokeDasharray="2 4" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => dayjs(d).format('D MMM')}
            tick={{ fill: 'var(--label-2)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: 'var(--label-2)', fontSize: 11 }}
            tickFormatter={(v: number) => (v < 0 ? `−${Math.abs(v)}` : String(v))}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <ReferenceLine y={0} stroke="var(--label-3)" />
          <Tooltip
            contentStyle={{ background: 'var(--cell-2)', border: 'none', borderRadius: 10, fontSize: 13 }}
            labelFormatter={(d: string) => dayjs(d).format('dddd D MMMM')}
            formatter={(v: number, k: string) => [Math.round(v), { fitness: 'Fitness', fatigue: 'Fatigue', form: 'Forme' }[k] ?? k]}
          />
          <Line type="monotone" dataKey="form" stroke={METRIC_COLORS.form} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="fatigue" stroke={METRIC_COLORS.fatigue} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="fitness" stroke={METRIC_COLORS.fitness} strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
