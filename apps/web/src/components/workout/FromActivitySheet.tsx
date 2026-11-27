import { useState } from 'react';
import { Avatar, Cell, Placeholder, Section, Sheet, SkeletonList } from '@/components/ios';
import { WorkoutProfile } from '@/components/workout/StructureEditor';
import { useActivityDetail, useAthleteOverview, useTeam } from '@/hooks/useCoach';
import { workoutFromIntervals } from '@/lib/fromActivity';
import { formatDuration, formatLoad, relativeDay } from '@/lib/format';
import { parseWorkout, workoutStats } from '@/lib/workout';

/**
 * « D'une sortie » : choisir un athlète puis une de ses sorties récentes ;
 * ses intervalles deviennent une séance (lib/fromActivity), ouverte ensuite
 * dans la feuille de création pour la nommer, l'ajuster et l'attribuer.
 */
export function FromActivitySheet({ onClose, onPick }: { onClose: () => void; onPick: (draft: { name: string; description: string }) => void }) {
  const team = useTeam();
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const overview = useAthleteOverview(athleteId ?? undefined);
  const detail = useActivityDetail(athleteId ?? undefined, activityId ?? undefined);
  const ftp = overview.data?.summary.ftp ?? null;
  const text = detail.data ? workoutFromIntervals(detail.data.intervals, ftp) : null;
  const activityName = detail.data?.activity.name ?? 'Sortie';

  return (
    <Sheet open onClose={onClose} title="D’une sortie">
      {!athleteId && (
        <Section header="De qui ?" footer="Les intervalles d’une sortie réussie deviennent une séance à renvoyer, à cet athlète ou à d’autres.">
          {(team.data?.athletes ?? []).map((a) => (
            <Cell key={a.id} inset={64} leading={<Avatar name={a.name} />} title={a.name} subtitle={`${a.weekHours.toLocaleString('fr-FR')} h sur 7 jours`} onClick={() => setAthleteId(a.id)} chevron />
          ))}
        </Section>
      )}

      {athleteId && !activityId && (
        <>
          <button type="button" onClick={() => setAthleteId(null)} style={{ color: 'var(--tint)', minHeight: 44 }}>
            ‹ Athlètes
          </button>
          {overview.isLoading && <SkeletonList rows={4} avatar={false} />}
          <Section header="Quelle sortie ?">
            {(overview.data?.activities ?? []).slice(0, 12).map((a) => (
              <Cell
                key={a.id}
                title={a.name ?? 'Sortie'}
                subtitle={`${relativeDay(a.start_date_local)} · ${formatDuration(a.moving_time)}${a.icu_weighted_avg_watts ? ` · ${a.icu_weighted_avg_watts} W` : ''}`}
                detail={formatLoad(a.icu_training_load)}
                onClick={() => setActivityId(a.id)}
                chevron
              />
            ))}
          </Section>
        </>
      )}

      {athleteId && activityId && (
        <>
          <button type="button" onClick={() => setActivityId(null)} style={{ color: 'var(--tint)', minHeight: 44 }}>
            ‹ Sorties
          </button>
          {detail.isLoading && <SkeletonList rows={3} avatar={false} />}
          {detail.data && !text && (
            <Placeholder title="Rien à reprendre">
              {ftp ? 'Cette sortie n’a pas d’effort assez long ou assez intense pour en faire une séance.' : 'FTP inconnue : impossible de convertir les efforts en %.'}
            </Placeholder>
          )}
          {text && (
            <div className="card" style={{ display: 'grid', gap: 10 }}>
              <div className="headline">{activityName}</div>
              <WorkoutProfile steps={parseWorkout(text)} height={48} />
              <div className="footnote secondary tabular-nums">
                {formatDuration(workoutStats(parseWorkout(text)).seconds)} · charge {workoutStats(parseWorkout(text)).load} · % de la FTP ({ftp} W)
              </div>
              <button type="button" className="button filled block pressable" onClick={() => onPick({ name: `${activityName} (reprise)`, description: text })}>
                Utiliser cette séance
              </button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
