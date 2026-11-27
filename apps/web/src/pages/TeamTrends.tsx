import { useQueryClient } from '@tanstack/react-query';
import { Page, Placeholder, SkeletonList } from '@/components/ios';
import { TeamFitnessGrid } from '@/components/trends/TeamFitnessGrid';
import { PullIndicator } from '@/components/common/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { trendKeys, useTeamFitness } from '@/hooks/useTrends';

/**
 * Tendances de l'équipe (coach) : fitness de chaque athlète côte à côte.
 * Page à part (chargée à la demande) pour garder « Équipe » légère : elle
 * reste l'écran du quotidien, les tendances se consultent de temps en temps.
 */
export default function TeamTrends() {
  const fitness = useTeamFitness();
  const queryClient = useQueryClient();
  const { pullPosition, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: trendKeys.teamFitness });
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
      </Page>
    </>
  );
}
