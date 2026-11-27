import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { TeamLoadChart } from './TeamLoadChart';
import type { TeamCalendarAthlete } from '@/types';

const WEEK = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];

const athlete = (name: string, planned: Record<number, number>, done: Record<number, number>, error: string | null = null): TeamCalendarAthlete => ({
  id: name,
  name,
  ftp: null,
  form: 12,
  groupIds: [],
  error,
  load: { planned: 0, done: 0, usual: null },
  days: WEEK.map((date, i) => ({
    date,
    availability: null,
    races: [],
    workouts: planned[i] != null ? [{ id: `${name}${i}`, name: 'Séance', description: null, sport: 'Ride', load: planned[i], seconds: 3600, done: false }] : [],
    activities: done[i] != null ? [{ id: `${name}a${i}`, name: 'Sortie', moving_time: 3600, load: done[i] }] : [],
  })),
});

const render = () =>
  renderWithProviders(
    <TeamLoadChart
      from="2026-11-23"
      to="2026-11-29"
      today="2026-11-26"
      athletes={[athlete('Léa', { 0: 80, 5: 120 }, { 0: 82 }), athlete('Hugo', { 0: 100, 2: 100 }, { 0: 60 }), athlete('Sam', { 0: 50 }, {}, 'Connexion à refaire')]}
    />,
  );

describe('TeamLoadChart', () => {
  it('une ligne par athlète, les plus en retard en tête, sans total d’équipe', () => {
    render();
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('aria-label')?.split(' :')[0])).toEqual(['Hugo', 'Léa', 'Sam']);
    expect(screen.queryByText(/équipe/i)).not.toBeInTheDocument();
  });

  it('compare la charge faite à la charge prévue à ce jour, en chiffres et en texte', () => {
    render();
    const hugo = screen.getByRole('listitem', { name: /^Hugo/ });
    expect(hugo).toHaveAccessibleName('Hugo : En retard sur le plan. Charge faite 60, prévue à ce jour 200, prévue sur la période 200.');
    expect(within(hugo).getByText('60')).toBeInTheDocument();
    const lea = screen.getByRole('listitem', { name: /^Léa/ });
    expect(lea).toHaveAccessibleName(/Suit le plan\. Charge faite 82, prévue à ce jour 80, prévue sur la période 200/);
    expect(within(lea).getByText(/200 sur la période/)).toBeInTheDocument();
  });

  it('signale un athlète sans données au lieu d’afficher zéro', () => {
    render();
    expect(screen.getByRole('listitem', { name: 'Sam : Données indisponibles' })).toBeInTheDocument();
  });

  it('ne montre rien sans athlète', () => {
    renderWithProviders(<TeamLoadChart from="2026-11-23" to="2026-11-29" today="2026-11-26" athletes={[]} />);
    expect(screen.queryByRole('heading', { name: 'Charge prévue / faite' })).not.toBeInTheDocument();
  });
});
