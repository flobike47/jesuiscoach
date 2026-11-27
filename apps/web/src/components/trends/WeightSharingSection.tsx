import dayjs from 'dayjs';
import { Section } from '@/components/ios';
import { useSetWeightSharing, useWeightSharing } from '@/hooks/useWeight';

/**
 * Accord de l'athlète : son coach peut-il voir la courbe de son poids ?
 * Désactivé par défaut, révocable à tout moment. Le BFF vérifie cet accord à
 * chaque lecture de la courbe par le coach.
 */
export function WeightSharingSection() {
  const q = useWeightSharing();
  const save = useSetWeightSharing();
  const checked = save.isPending ? Boolean(save.variables) : Boolean(q.data?.weightToCoach);
  const since = !save.isPending && q.data?.weightSince ? dayjs(q.data.weightSince).format('D MMMM YYYY') : null;

  return (
    <Section
      header="Partage avec ton coach"
      footer={
        <>
          Désactivé, ton coach ne voit pas l’évolution de ton poids ; tu la vois toujours dans Progrès. Tu peux retirer
          ton accord à tout moment. Ton poids du jour reste dans ta fiche, que ton coach consulte (il sert aux watts par
          kilo).
          {since && ` Partagé depuis le ${since}.`}
        </>
      }
    >
      <div className="cell">
        <label htmlFor="share-weight" style={{ flex: 1 }}>
          Évolution de mon poids
        </label>
        <input
          id="share-weight"
          type="checkbox"
          role="switch"
          className="switch"
          checked={checked}
          aria-checked={checked}
          disabled={!q.data || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
      </div>
      {(save.error || q.error) && (
        <p role="alert" className="footnote" style={{ padding: '0 16px 8px', margin: 0, color: 'var(--red)' }}>
          {(save.error ?? q.error)?.message}
        </p>
      )}
    </Section>
  );
}
