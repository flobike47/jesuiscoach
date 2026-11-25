import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { Cell, Page, Placeholder, Section, Segmented } from '@/components/ios';
import { Spinner } from '@/components/common/PageLoader';
import { ZoneBar } from '@/components/common/ZoneBar';
import { useZones } from '@/hooks/useCoach';
import { useAthleteBack } from '@/hooks/useAthleteBack';
import { formatHours } from '@/lib/format';
import { ZONE_COLORS } from '@/theme';
import type { ZonesWeek } from '@/types';

type Kind = 'power' | 'hr';
const ZONES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'];

/** Temps passé par zone, semaine par semaine, et zones de l'athlète. */
export default function AthleteZones() {
  const { id } = useParams();
  const back = useAthleteBack(id);
  const { data, isLoading, error } = useZones(id);
  const [kind, setKind] = useState<Kind>('power');

  const chart = useMemo(
    () =>
      (data?.weeks ?? []).map((w) => ({
        label: dayjs(w.week).format('D/M'),
        week: w.week,
        ...Object.fromEntries(w[kind].map((s, i) => [ZONES[i], Math.round((s / 3600) * 10) / 10])),
      })),
    [data, kind],
  );

  // Semaine résumée : la semaine en cours, ou la dernière semaine avec des données.
  const focus = useMemo(() => {
    const weeks = [...(data?.weeks ?? [])].reverse();
    return weeks.find((w) => w[kind].some((s) => s > 0)) ?? null;
  }, [data, kind]);

  const withData = kind === 'power' ? data?.ridesWithPower : data?.ridesWithHr;
  const zoneRanges = kind === 'power' ? data?.powerZones : data?.hrZones;
  const unit = kind === 'power' ? 'W' : 'bpm';

  return (
    <Page title="Zones" back={back}>
      {isLoading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      )}
      {error && <Placeholder title="Zones indisponibles">{error.message}</Placeholder>}

      {data && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Segmented<Kind>
              label="Zones"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'power', label: 'Puissance' },
                { value: 'hr', label: 'Cardio' },
              ]}
            />
          </div>

          {withData === 0 ? (
            <Placeholder title={kind === 'power' ? 'Pas de données de puissance' : 'Pas de données cardio'}>
              {data.rides === 0
                ? 'Aucune sortie sur les 8 dernières semaines.'
                : kind === 'power'
                  ? 'Aucune sortie de la période n’a été enregistrée avec un capteur de puissance.'
                  : 'Aucune sortie de la période n’a été enregistrée avec une ceinture ou une montre cardio.'}
            </Placeholder>
          ) : (
            <>
              <div className="card">
                <div className="caption secondary" style={{ marginBottom: 6 }}>
                  Temps par zone · {data.weeks.length} semaines (heures)
                </div>
                <div style={{ height: 190 }} role="img" aria-label="Heures passées dans chaque zone, semaine par semaine">
                  <ResponsiveContainer>
                    <BarChart data={chart} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
                      <CartesianGrid vertical={false} stroke="var(--separator)" strokeDasharray="2 4" />
                      <XAxis dataKey="label" tick={{ fill: 'var(--label-2)', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: 'var(--label-2)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip
                        cursor={{ fill: 'var(--fill)' }}
                        contentStyle={{ background: 'var(--cell-2)', border: 'none', borderRadius: 10, fontSize: 13 }}
                        labelFormatter={(_: string, p) => `Semaine du ${dayjs((p[0]?.payload as { week?: string })?.week).format('D MMMM')}`}
                        formatter={(v: number, k: string) => [`${v.toLocaleString('fr-FR')} h`, k]}
                      />
                      {ZONES.map((z, i) => (
                        <Bar key={z} dataKey={z} stackId="z" fill={ZONE_COLORS[i]} isAnimationActive={false} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="caption secondary" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center', marginTop: 6 }}>
                  {ZONES.map((z, i) => (
                    <span key={z}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[i], marginRight: 4 }} />
                      {z}
                    </span>
                  ))}
                </div>
              </div>

              {focus && <WeekSummary week={focus} kind={kind} current={focus === data.weeks[data.weeks.length - 1]} />}
            </>
          )}

          {zoneRanges && zoneRanges.length > 0 && (
            <Section
              header={kind === 'power' && data.ftp ? `Zones de puissance · FTP ${data.ftp} W` : kind === 'power' ? 'Zones de puissance' : 'Zones cardio'}
              footer="Réglées dans Intervals.icu (Réglages → Sports)."
            >
              {zoneRanges.map((z, i) => (
                <Cell
                  key={z.name}
                  inset={44}
                  leading={<span style={{ width: 12, height: 12, borderRadius: 3, background: ZONE_COLORS[i] }} aria-hidden />}
                  title={`Z${i + 1} ${z.name}`}
                  detail={<span className="tabular-nums">{z.to == null ? `${z.from} ${unit} et +` : `${z.from}–${z.to} ${unit}`}</span>}
                />
              ))}
              {kind === 'power' && data.sweetSpot && (
                <Cell inset={44} leading={<span aria-hidden style={{ width: 12 }} />} title="Sweet spot" detail={<span className="tabular-nums">{`${data.sweetSpot.from}–${data.sweetSpot.to} W`}</span>} />
              )}
            </Section>
          )}

          {withData !== 0 && withData != null && withData < data.rides && (
            <p className="section-footer">
              {data.rides - withData} sortie{data.rides - withData > 1 ? 's' : ''} sur {data.rides} sans {kind === 'power' ? 'capteur de puissance' : 'cardio'} :
              non comptée{data.rides - withData > 1 ? 's' : ''} ici.
            </p>
          )}
        </>
      )}
    </Page>
  );
}

function WeekSummary({ week, kind, current }: { week: ZonesWeek; kind: Kind; current: boolean }) {
  const secs = week[kind];
  const total = secs.reduce((s, v) => s + v, 0);
  const pct = (from: number, to: number) => Math.round((secs.slice(from, to).reduce((s, v) => s + v, 0) / total) * 100);
  return (
    <Section header={`${current ? 'Cette semaine' : `Semaine du ${dayjs(week.week).format('D MMMM')}`} · ${formatHours(total)}`}>
      <div style={{ padding: '12px 16px 4px' }}>
        <ZoneBar seconds={secs} />
      </div>
      <Cell title="Endurance (Z1–Z2)" detail={<span className="tabular-nums">{pct(0, 2)} %</span>} />
      <Cell title="Tempo et seuil (Z3–Z4)" detail={<span className="tabular-nums">{pct(2, 4)} %</span>} />
      <Cell title="Haute intensité (Z5 et +)" detail={<span className="tabular-nums">{pct(4, 7)} %</span>} />
    </Section>
  );
}
