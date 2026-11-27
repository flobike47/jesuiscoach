import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Lock } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Segmented, Skeleton } from '@/components/ios';
import { isNotShared, useWeight, useWeightSharing } from '@/hooks/useWeight';
import { formatChange, formatKg, inRange, summarizeWeight, weightDomain, type WeightRange } from '@/lib/weightTrend';

/**
 * Évolution du poids, sur la fiche athlète et dans « Progrès ». L'athlète voit
 * toujours la sienne ; le coach seulement si l'athlète l'a autorisé (le BFF
 * renvoie 403 sinon, affiché ici comme un état normal, pas comme une panne).
 * Importe recharts : à n'utiliser que dans des pages chargées en `lazy`.
 */

/** Couleur propre au poids (distincte de fitness / fatigue / forme). */
const WEIGHT_COLOR = 'var(--teal)';

export function WeightCard({ athleteId, self, name }: { athleteId: string; self: boolean; name: string }) {
  const q = useWeight(athleteId);
  const sharing = useWeightSharing(self);
  const [range, setRange] = useState<WeightRange>('365');
  const today = dayjs().format('YYYY-MM-DD');
  const points = useMemo(() => inRange(q.data?.points ?? [], range, today), [q.data, range, today]);
  const summary = summarizeWeight(points);

  const title = (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
      <h2 className="headline" style={{ margin: 0 }}>
        Poids
      </h2>
      {summary && (
        <span className="footnote secondary tabular-nums">
          {formatKg(summary.latest.kg)}
          {summary.change != null && ` · ${formatChange(summary.change)} en ${range === '90' ? '3 mois' : '12 mois'}`}
        </span>
      )}
    </div>
  );

  if (q.isLoading) {
    return (
      <div className="card" aria-busy="true">
        {title}
        <Skeleton height={140} />
      </div>
    );
  }

  if (q.error) {
    return (
      <div className="card">
        {title}
        {isNotShared(q.error) ? (
          <p className="footnote secondary" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Lock size={15} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
            <span>{name} ne partage pas l’évolution de son poids. Le partage se règle dans son profil.</span>
          </p>
        ) : (
          <p className="footnote secondary" style={{ margin: 0 }}>
            Courbe indisponible : {q.error.message}
          </p>
        )}
      </div>
    );
  }

  const all = q.data?.points ?? [];
  return (
    <div className="card">
      {title}
      {all.length === 0 ? (
        <p className="footnote secondary" style={{ margin: 0 }}>
          Aucune pesée sur les 12 derniers mois.
          {self && (
            <>
              {' '}
              <Link to="/profil/identite">Saisir mon poids</Link>
            </>
          )}
        </p>
      ) : (
        <>
          <div style={{ margin: '0 0 8px' }}>
            <Segmented<WeightRange>
              label="Période du poids"
              value={range}
              onChange={setRange}
              options={[
                { value: '90', label: '3 mois' },
                { value: '365', label: '12 mois' },
              ]}
            />
          </div>
          {points.length === 0 ? (
            <p className="footnote secondary" style={{ margin: 0 }}>
              Aucune pesée sur les 3 derniers mois.
            </p>
          ) : (
            <WeightChart points={points} />
          )}
        </>
      )}
      {self && sharing.data && (
        <p className="caption secondary" style={{ margin: '8px 0 0' }}>
          {sharing.data.weightToCoach ? 'Partagée avec ton coach.' : 'Visible par toi seul.'}{' '}
          <Link to="/profil/identite">Modifier</Link>
        </p>
      )}
    </div>
  );
}

function WeightChart({ points }: { points: Array<{ date: string; kg: number }> }) {
  const [lo, hi] = weightDomain(points);
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <div
      style={{ height: 160 }}
      role="img"
      aria-label={`Courbe du poids : ${formatKg(first.kg)} le ${dayjs(first.date).format('D MMMM')}, ${formatKg(last.kg)} le ${dayjs(last.date).format('D MMMM')}`}
    >
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--separator)" strokeDasharray="2 4" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => dayjs(d).format('MMM')}
            tick={{ fill: 'var(--label-2)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis
            domain={[lo, hi]}
            allowDecimals={false}
            tick={{ fill: 'var(--label-2)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{ background: 'var(--cell-2)', border: 'none', borderRadius: 10, fontSize: 13 }}
            labelFormatter={(d: string) => dayjs(d).format('dddd D MMMM YYYY')}
            formatter={(v: number) => [formatKg(v), 'Poids']}
          />
          <Line type="monotone" dataKey="kg" stroke={WEIGHT_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
