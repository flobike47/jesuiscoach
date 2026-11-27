import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import TeamTrends from './TeamTrends';

const api = vi.hoisted(() => ({ teamFitness: vi.fn(), teamSports: vi.fn() }));
vi.mock('@/services/trendsApi', () => ({ trendsApi: api }));

const series = (values: number[]) => values.map((fitness, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, fitness }));

const noSports = { from: '2026-10-31', to: '2026-11-27', team: { Ride: 0, Run: 0, Swim: 0, Other: 0 }, athletes: [], errors: [] };

beforeEach(() => {
  api.teamFitness.mockReset();
  api.teamSports.mockReset();
  api.teamSports.mockResolvedValue(noSports);
});

describe('TeamTrends', () => {
  it('montre une courbe par athlète, à la même échelle, avec son évolution', async () => {
    api.teamFitness.mockResolvedValue({
      from: '2026-11-01',
      to: '2026-11-03',
      athletes: [
        { id: 'i1', name: 'Julie', series: series([40, 44, 46.4]) },
        { id: 'i2', name: 'Paul', series: series([52, 50, 47]) },
      ],
      errors: [],
    });
    renderPage(<TeamTrends />);
    const list = await screen.findByRole('list', { name: 'Fitness de chaque athlète' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: 'Julie' })).toHaveAttribute('href', '/athletes/i1');
    expect(within(items[0]).getByRole('img', { name: /Julie : fitness 46, \+6 depuis le/ })).toBeInTheDocument();
    expect(within(items[1]).getByRole('img', { name: /Paul : fitness 47, −5/ })).toBeInTheDocument();
    // Une seule échelle pour tous (pas une moyenne)
    expect(screen.getByText('Même échelle pour tous : de 0 à 60.')).toBeInTheDocument();
    expect(screen.getByText(/La fitness reflète la charge accumulée/)).toBeInTheDocument();
  });

  it('donne les valeurs en tableau', async () => {
    api.teamFitness.mockResolvedValue({ from: '2026-11-01', to: '2026-11-02', athletes: [{ id: 'i1', name: 'Julie', series: series([40, 44]) }], errors: [] });
    renderPage(<TeamTrends />);
    fireEvent.click(await screen.findByText('Voir les valeurs'));
    const row = screen.getByRole('row', { name: /Julie/ });
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['40', '40', '44']);
  });

  it('signale les athlètes indisponibles et les erreurs', async () => {
    api.teamFitness.mockResolvedValue({ from: '2026-11-01', to: '2026-11-02', athletes: [], errors: [{ id: 'i3', error: 'x' }] });
    renderPage(<TeamTrends />);
    expect(await screen.findByText(/1 athlète\(s\) indisponible\(s\)/)).toBeInTheDocument();
  });

  it("répartit le temps par sport pour l'équipe puis pour chaque athlète", async () => {
    api.teamFitness.mockResolvedValue({ from: '2026-11-01', to: '2026-11-02', athletes: [], errors: [] });
    api.teamSports.mockResolvedValue({
      ...noSports,
      team: { Ride: 8 * 3600, Run: 2 * 3600, Swim: 0, Other: 0 },
      athletes: [
        { id: 'i1', name: 'Julie', time: { Ride: 2 * 3600, Run: 2 * 3600, Swim: 0, Other: 0 } },
        { id: 'i2', name: 'Paul', time: { Ride: 6 * 3600, Run: 0, Swim: 0, Other: 0 } },
        { id: 'i3', name: 'Léa', time: { Ride: 0, Run: 0, Swim: 0, Other: 0 } },
      ],
    });
    renderPage(<TeamTrends />);
    expect(await screen.findByText('10 h au total')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Vélo 80 %, Course 20 %' })).toBeInTheDocument();
    expect(screen.getByText('8 h · 80 %')).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Sports de chaque athlète' })).getAllByRole('listitem');
    // Le plus actif d'abord ; l'athlète sans sortie reste listé
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual(['Paul', 'Julie', 'Léa']);
    expect(within(rows[1]).getByRole('img', { name: 'Vélo 50 %, Course 50 %' })).toBeInTheDocument();
    expect(within(rows[2]).getByText('Aucune sortie')).toBeInTheDocument();
  });
});
