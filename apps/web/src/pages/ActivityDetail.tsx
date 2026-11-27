import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { Cell, MetricGrid, Page, Placeholder, Section, SkeletonList } from '@/components/ios';
import { ZoneBar } from '@/components/common/ZoneBar';
import { useActivityDetail } from '@/hooks/useCoach';
import { useAthleteBack } from '@/hooks/useAthleteBack';
import { formatClock, formatDuration, formatHours, formatKm, formatLoad, formatIntensity } from '@/lib/format';
import { ZONE_COLORS } from '@/theme';
import type { ActivityView } from '@/types';

/** Détail d'une sortie : chiffres clés, puissance et cardio, intervalles, zones. */
export default function ActivityDetail() {
  const { id, activityId } = useParams();
  const back = useAthleteBack(id);
  const { data, isLoading, error } = useActivityDetail(id, activityId);

  return (
    <Page
      title={data?.activity.name ?? 'Sortie'}
      back={back}
      header={
        data && (
          <p className="footnote secondary" style={{ margin: '-6px 0 12px' }}>
            {dayjs(data.activity.date).format('dddd D MMMM · HH:mm')}
          </p>
        )
      }
    >
      {isLoading && <SkeletonList rows={4} avatar={false} />}
      {error && <Placeholder title="Sortie indisponible">{error.message}</Placeholder>}
      {data && <Detail view={data} />}
    </Page>
  );
}

function Detail({ view }: { view: ActivityView }) {
  const a = view.activity;
  const { streams } = view;
  const points = useMemo(
    () => streams.time.map((t, i) => ({ t, watts: streams.watts?.[i] ?? null, hr: streams.heartrate?.[i] ?? null })),
    [streams],
  );
  const hasCurves = Boolean(streams.watts || streams.heartrate) && points.length > 1;

  return (
    <>
      <div className="card">
        <MetricGrid
          items={[
            { label: 'Durée', value: formatDuration(a.movingTime) },
            { label: 'Distance', value: formatKm(a.distance) },
            { label: 'D+', value: a.elevation != null ? `${a.elevation} m` : '–' },
            { label: 'Charge', value: formatLoad(a.load) },
            { label: 'P. pondérée', value: a.weightedWatts != null ? `${a.weightedWatts} W` : '–' },
            { label: 'Intensité', value: formatIntensity(a.intensity) },
          ]}
        />
      </div>

      {hasCurves ? (
        <div className="card">
          <div className="caption secondary" style={{ marginBottom: 6 }}>
            {streams.watts && streams.heartrate ? 'Puissance et cardio' : streams.watts ? 'Puissance' : 'Cardio'}
          </div>
          <div style={{ height: 190 }} role="img" aria-label="Puissance et fréquence cardiaque au fil de la sortie, intervalles surlignés">
            <ResponsiveContainer>
              <ComposedChart data={points} margin={{ top: 6, right: 0, bottom: 0, left: -14 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" strokeDasharray="2 4" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) => `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`}
                  tick={{ fill: 'var(--label-2)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />
                {streams.watts && <YAxis yAxisId="w" tick={{ fill: 'var(--label-2)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />}
                {streams.heartrate && (
                  <YAxis yAxisId="hr" orientation="right" domain={['dataMin - 10', 'dataMax + 5']} hide={Boolean(streams.watts)} tick={{ fill: 'var(--label-2)', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                )}
                {view.intervals.map((iv, i) => (
                  <ReferenceArea key={i} x1={iv.start} x2={iv.end} yAxisId={streams.watts ? 'w' : 'hr'} fill="var(--yellow)" fillOpacity={0.18} ifOverflow="hidden" />
                ))}
                <Tooltip
                  contentStyle={{ background: 'var(--cell-2)', border: 'none', borderRadius: 10, fontSize: 13 }}
                  labelFormatter={(t: number) => formatClock(t)}
                  formatter={(v: number, k: string) => (k === 'watts' ? [`${v} W`, 'Puissance'] : [`${v} bpm`, 'Cardio'])}
                />
                {streams.watts && (
                  <Area yAxisId="w" type="monotone" dataKey="watts" stroke="var(--indigo)" strokeWidth={1.5} fill="var(--indigo)" fillOpacity={0.2} isAnimationActive={false} connectNulls={false} />
                )}
                {streams.heartrate && <Line yAxisId="hr" type="monotone" dataKey="hr" stroke="var(--red)" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="caption secondary" style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 6 }}>
            {streams.watts && <Swatch color="var(--indigo)" label="Puissance" />}
            {streams.heartrate && <Swatch color="var(--red)" label="Cardio" />}
            {view.intervals.length > 0 && <Swatch color="var(--yellow)" label="Intervalles" block />}
          </div>
        </div>
      ) : (
        <p className="section-footer">Pas de courbe de puissance ni de cardio pour cette sortie.</p>
      )}

      {(view.intervals.length > 0 || a.decoupling != null) && (
        <Section header="Intervalles" footer={a.decoupling != null ? 'Dérive cardio : hausse du cardio à puissance égale entre la 1re et la 2e moitié. Au-delà de 5 %, l’endurance est encore à construire.' : undefined}>
          {view.intervals.map((iv, i) => (
            <Cell
              key={i}
              title={<span className="tabular-nums">{`${i + 1} · ${formatClock(iv.duration)}`}</span>}
              detail={
                <span className="tabular-nums">
                  {[iv.watts != null ? `${iv.watts} W` : null, iv.heartrate != null ? `${iv.heartrate} bpm` : null, iv.zone != null ? `Z${iv.zone}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              }
            />
          ))}
          {a.decoupling != null && (
            <Cell
              title={<span className="secondary">Dérive cardio</span>}
              detail={<span className="tabular-nums" style={{ color: a.decoupling > 5 ? 'var(--orange)' : 'var(--green)' }}>{`${a.decoupling.toLocaleString('fr-FR')} %`}</span>}
            />
          )}
        </Section>
      )}

      {(view.powerZones || view.hrZones) && (
        <Section header="Temps par zone">
          {view.powerZones && <ZoneRow label="Puissance" seconds={view.powerZones} />}
          {view.hrZones && <ZoneRow label="Cardio" seconds={view.hrZones} />}
        </Section>
      )}
    </>
  );
}

function ZoneRow({ label, seconds }: { label: string; seconds: number[] }) {
  return (
    <div style={{ padding: '10px 16px' }}>
      <div className="footnote secondary" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <ZoneBar seconds={seconds} />
      <div className="caption secondary tabular-nums" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 6 }}>
        {seconds.map((s, i) =>
          s > 0 ? (
            <span key={i}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[i], marginRight: 4 }} />
              Z{i + 1} {formatHours(s)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Swatch({ color, label, block }: { color: string; label: string; block?: boolean }) {
  return (
    <span>
      <span
        style={{ display: 'inline-block', width: 10, height: block ? 10 : 3, borderRadius: 2, background: color, opacity: block ? 0.5 : 1, verticalAlign: 'middle', marginRight: 5 }}
      />
      {label}
    </span>
  );
}
