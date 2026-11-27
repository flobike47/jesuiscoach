import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import TeamTrends from './TeamTrends';

const api = vi.hoisted(() => ({ teamFitness: vi.fn() }));
vi.mock('@/services/trendsApi', () => ({ trendsApi: api }));

const series = (values: number[]) => values.map((fitness, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, fitness }));

beforeEach(() => api.teamFitness.mockReset());

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
});
