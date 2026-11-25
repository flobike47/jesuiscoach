import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { Cell, Page, Placeholder, Section, Segmented } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { usePower } from '@/hooks/useCoach';
import { useAthleteBack } from '@/hooks/useAthleteBack';
import { formatSpan } from '@/lib/format';
import type { CurveRange, PowerRecord } from '@/types';

const LABELS: Record<CurveRange, string> = { '90d': '90 jours', '1y': '1 an' };
const OTHER: Record<CurveRange, CurveRange> = { '90d': '1y', '1y': '90d' };
const TICKS = [5, 60, 300, 1200, 3600];

/** Courbe de puissance, records et modèle (CP, W′, FTP estimée). */
export default function AthletePower() {
  const { id } = useParams();
  const back = useAthleteBack(id);
  const { data, isLoading, error } = usePower(id);
  const [range, setRange] = useState<CurveRange>('90d');

  const chart = useMemo(() => {
    if (!data) return [];
    const bySecs = new Map<number, { secs: number; main?: number; other?: number }>();
    for (const p of data.curves[range]) bySecs.set(p.secs, { secs: p.secs, main: p.watts });
    for (const p of data.curves[OTHER[range]]) bySecs.set(p.secs, { ...(bySecs.get(p.secs) ?? { secs: p.secs }), other: p.watts });
    return [...bySecs.values()].sort((a, b) => a.secs - b.secs);
  }, [data, range]);

  const model = data?.models[range];
  const empty = data && data.curves['90d'].length === 0 && data.curves['1y'].length === 0;

  return (
    <Page title="Puissance" back={back}>
      {isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}
      {error && <Placeholder title="Courbe indisponible">{error.message}</Placeholder>}
      {empty && <Placeholder title="Pas encore de données de puissance">Il faut des sorties enregistrées avec un capteur de puissance.</Placeholder>}

      {data && !empty && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Segmented<CurveRange>
              label="Période"
              value={range}
              onChange={setRange}
              options={[
                { value: '90d', label: '90 jours' },
                { value: '1y', label: '1 an' },
              ]}
            />
          </div>

          <div className="card">
            <div className="caption secondary" style={{ marginBottom: 6 }}>
              Courbe de puissance
            </div>
            <div style={{ height: 200 }} role="img" aria-label={`Courbe de puissance sur ${LABELS[range]}, comparée à ${LABELS[OTHER[range]]}`}>
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid vertical={false} stroke="var(--separator)" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="secs"
                    type="number"
                    scale="log"
                    domain={['dataMin', 'dataMax']}
                    ticks={TICKS}
                    tickFormatter={(s: number) => formatSpan(s)}
                    tick={{ fill: 'var(--label-2)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: 'var(--label-2)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ background: 'var(--cell-2)', border: 'none', borderRadius: 10, fontSize: 13 }}
                    labelFormatter={(s: number) => formatSpan(s)}
                    formatter={(v: number, k: string) => [`${v} W`, k === 'main' ? LABELS[range] : LABELS[OTHER[range]]]}
                  />
                  <Line type="monotone" dataKey="other" stroke="var(--label-3)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="main" stroke="var(--blue)" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="caption secondary" style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 6 }}>
              <Swatch color="var(--blue)" label={LABELS[range]} />
              <Swatch color="var(--label-3)" label={LABELS[OTHER[range]]} />
            </div>
          </div>

          <Section header={`Records · ${LABELS[range]}`} footer={range === '90d' ? '« Record » : meilleure valeur de l’année, établie ces 90 derniers jours.' : undefined}>
            {data.records[range].length === 0 && <Cell title={<span className="secondary">Aucun record sur la période</span>} />}
            {data.records[range].map((r) => (
              <RecordCell key={r.secs} id={id!} record={r} />
            ))}
          </Section>

          <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Metric label="FTP estimée" value={model?.ftp != null ? `${model.ftp} W` : '–'} />
            <Metric label="FTP réglée" value={data.ftp != null ? `${data.ftp} W` : '–'} />
            <Metric label="W′" value={model?.wPrime != null ? `${(model.wPrime / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kJ` : '–'} />
          </div>
          <p className="section-footer">
            FTP estimée et W′ (réserve au-dessus du seuil) : modèle de puissance critique calculé par Intervals.icu sur {LABELS[range]}.
          </p>
        </>
      )}
    </Page>
  );
}

function RecordCell({ id, record }: { id: string; record: PowerRecord }) {
  const origin = [record.activityName, record.date ? dayjs(record.date).format('D MMM') : null].filter(Boolean).join(' · ');
  return (
    <Cell
      title={formatSpan(record.secs)}
      subtitle={origin || undefined}
      to={record.activityId ? `/athletes/${encodeURIComponent(id)}/sorties/${encodeURIComponent(record.activityId)}` : undefined}
      chevron={Boolean(record.activityId)}
      detail={
        <span className="tabular-nums">
          <span style={{ color: 'var(--label)', fontWeight: 600 }}>{record.watts} W</span>
          {record.wkg != null && ` · ${record.wkg.toLocaleString('fr-FR')} W/kg`}
          {record.yearBest && <span style={{ color: 'var(--green)', marginLeft: 6 }}>▲ record</span>}
        </span>
      }
    />
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="caption secondary">{label}</div>
      <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <span style={{ display: 'inline-block', width: 10, height: 3, borderRadius: 2, background: color, verticalAlign: 'middle', marginRight: 5 }} />
      {label}
    </span>
  );
}
