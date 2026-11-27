import { useQueryClient } from '@tanstack/react-query';
import { Page, Placeholder, SkeletonList } from '@/components/ios';
import { TeamFitnessGrid } from '@/components/trends/TeamFitnessGrid';
import { TeamSports } from '@/components/trends/SportsBreakdown';
import { PullIndicator } from '@/components/common/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { trendKeys, useTeamFitness, useTeamSports } from '@/hooks/useTrends';

/**
 * Tendances de l'équipe (coach) : fitness de chaque athlète côte à côte et
 * répartition des sports pratiqués.
 * Page à part (chargée à la demande) pour garder « Équipe » légère : elle
 * reste l'écran du quotidien, les tendances se consultent de temps en temps.
 */
export default function TeamTrends() {
  const fitness = useTeamFitness();
  const sports = useTeamSports();
  const queryClient = useQueryClient();
  const { pullPosition, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trendKeys.teamFitness }),
        queryClient.invalidateQueries({ queryKey: trendKeys.teamSports }),
      ]);
    },
  });

  return (
    <>
      <PullIndicator pullPosition={pullPosition} isRefreshing={isRefreshing} />
      <Page title="Tendances" back={{ to: '/equipe', label: 'Équipe' }}>
        <section aria-labelledby="fitness-groupe">
          <h2 id="fitness-groupe" className="section-header" style={{ margin: '16px 0 6px' }}>
            Fitness du groupe · 90 jours
          </h2>
          <p className="footnote secondary" style={{ margin: '0 4px 10px' }}>
            La fitness reflète la charge accumulée : elle suit la charge des six dernières semaines environ. Elle monte
            quand l’athlète s’entraîne régulièrement et baisse au repos. Une courbe par athlète, à la même échelle.
          </p>
          {fitness.isLoading && <SkeletonList rows={3} avatar={false} />}
          {fitness.error && (
            <Placeholder
              title="Tendances indisponibles"
              action={
                <button type="button" className="button tinted pressable" onClick={() => fitness.refetch()}>
                  Réessayer
                </button>
              }
            >
              {fitness.error.message}
            </Placeholder>
          )}
          {fitness.data && fitness.data.athletes.length === 0 && fitness.data.errors.length === 0 && (
            <Placeholder title="Aucun athlète">Invite tes athlètes depuis Réglages pour suivre leur fitness.</Placeholder>
          )}
          {fitness.data && fitness.data.athletes.length > 0 && <TeamFitnessGrid athletes={fitness.data.athletes} />}
          {fitness.data && fitness.data.errors.length > 0 && (
            <p className="section-footer">{fitness.data.errors.length} athlète(s) indisponible(s) : connexion Intervals.icu à refaire.</p>
          )}
        </section>

        <section aria-labelledby="sports-groupe">
          <h2 id="sports-groupe" className="section-header" style={{ margin: '24px 0 6px' }}>
            Sports pratiqués
          </h2>
          <p className="footnote secondary" style={{ margin: '0 4px 10px' }}>
            Nombre de sorties par sport sur les 4 dernières semaines, pour l’équipe puis pour chacun.
          </p>
          {sports.isLoading && <SkeletonList rows={3} avatar={false} />}
          {sports.error && <Placeholder title="Répartition indisponible">{sports.error.message}</Placeholder>}
          {sports.data && <TeamSports data={sports.data} />}
        </section>
      </Page>
    </>
  );
}
