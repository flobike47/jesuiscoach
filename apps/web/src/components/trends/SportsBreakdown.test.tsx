import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import { ApiError } from '@/services/api';
import { AthleteSportsCard } from './SportsBreakdown';

const api = vi.hoisted(() => ({ athleteSports: vi.fn() }));
vi.mock('@/services/trendsApi', () => ({ trendsApi: api }));

// Corps en bloc : une fonction renvoyée par beforeEach serait appelée comme nettoyage.
beforeEach(() => {
  api.athleteSports.mockReset();
});

describe('AthleteSportsCard', () => {
  it('écrit chaque sport avec son nombre de sorties et sa part', async () => {
    api.athleteSports.mockResolvedValue({ from: '2026-10-31', to: '2026-11-27', count: { Ride: 12, Run: 3, Swim: 1, Other: 0 } });
    renderPage(<AthleteSportsCard athleteId="i1" />);
    expect(await screen.findByText('16 sorties au total')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Vélo 75 %, Natation 6 %, Course 19 %' })).toBeInTheDocument();
    expect(screen.getByText('Vélo')).toBeInTheDocument();
    expect(screen.getByText('3 sorties · 19 %')).toBeInTheDocument();
    expect(screen.queryByText('Autre')).not.toBeInTheDocument();
    expect(api.athleteSports).toHaveBeenCalledWith('i1');
  });

  it('dit quand il n’y a aucune sortie', async () => {
    api.athleteSports.mockResolvedValue({ from: '2026-10-31', to: '2026-11-27', count: { Ride: 0, Run: 0, Swim: 0, Other: 0 } });
    renderPage(<AthleteSportsCard athleteId="i1" />);
    expect(await screen.findByText('Aucune sortie sur les 4 dernières semaines.')).toBeInTheDocument();
  });

  it('affiche une erreur lisible', async () => {
    api.athleteSports.mockRejectedValue(new ApiError("Cet athlète n'a pas (ou plus) connecté son compte Intervals.icu", 409, 'r'));
    renderPage(<AthleteSportsCard athleteId="i1" />);
    expect(await screen.findByText(/Répartition indisponible : Cet athlète n'a pas/)).toBeInTheDocument();
  });
});
