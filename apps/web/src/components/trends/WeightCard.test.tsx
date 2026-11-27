import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { renderPage } from '@/hooks/test-utils';
import { ApiError } from '@/services/api';
import { WeightCard } from './WeightCard';
import { WeightSharingSection } from './WeightSharingSection';

const api = vi.hoisted(() => ({
  weight: vi.fn(),
  sharing: vi.fn(),
  setSharing: vi.fn(),
}));
vi.mock('@/services/weightApi', () => ({ weightApi: api }));

// jsdom n'a pas ResizeObserver (utilisé par ResponsiveContainer de recharts)
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const day = (n: number) => dayjs().subtract(n, 'day').format('YYYY-MM-DD');

beforeEach(() => {
  api.weight.mockReset();
  api.sharing.mockReset();
  api.setSharing.mockReset();
});

describe('WeightCard', () => {
  it('affiche le refus du BFF comme un état « non partagé », sans retenter', async () => {
    api.weight.mockRejectedValue(new ApiError("Cet athlète ne partage pas l'évolution de son poids", 403, 'r1'));
    renderPage(<WeightCard athleteId="i1" self={false} name="Julie" />);
    expect(await screen.findByText(/Julie ne partage pas l’évolution de son poids/)).toBeInTheDocument();
    expect(api.weight).toHaveBeenCalledTimes(1);
    expect(api.sharing).not.toHaveBeenCalled();
  });

  it('montre le dernier poids et son évolution sur la période', async () => {
    api.weight.mockResolvedValue({ points: [{ date: day(300), kg: 74.2 }, { date: day(2), kg: 71.6 }], days: 365 });
    api.sharing.mockResolvedValue({ weightToCoach: false, weightSince: null });
    renderPage(<WeightCard athleteId="i1" self name="Julie" />);
    expect(await screen.findByText(/71,6 kg · −2,6 kg en 12 mois/)).toBeInTheDocument();
    expect(await screen.findByText('Visible par toi seul.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Courbe du poids/ })).toBeInTheDocument();
  });

  it('propose de saisir son poids quand il n’y a aucune pesée', async () => {
    api.weight.mockResolvedValue({ points: [], days: 365 });
    api.sharing.mockResolvedValue({ weightToCoach: true, weightSince: '2026-01-01T00:00:00Z' });
    renderPage(<WeightCard athleteId="i1" self name="Julie" />);
    expect(await screen.findByRole('link', { name: 'Saisir mon poids' })).toHaveAttribute('href', '/profil/identite');
    expect(await screen.findByText('Partagée avec ton coach.')).toBeInTheDocument();
  });
});

describe('WeightSharingSection', () => {
  it('est désactivé par défaut et enregistre l’accord de l’athlète', async () => {
    api.sharing.mockResolvedValue({ weightToCoach: false, weightSince: null });
    api.setSharing.mockResolvedValue({ weightToCoach: true, weightSince: '2026-11-27T10:00:00Z' });
    renderPage(<WeightSharingSection />);
    const sw = await screen.findByRole('switch', { name: 'Évolution de mon poids' });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    await waitFor(() => expect(api.setSharing).toHaveBeenCalledTimes(1));
    expect(api.setSharing.mock.calls[0][0]).toBe(true);
    await waitFor(() => expect(sw).toBeChecked());
    expect(await screen.findByText(/Partagé depuis le 27 novembre 2026/)).toBeInTheDocument();
  });

  it('retire l’accord', async () => {
    api.sharing.mockResolvedValue({ weightToCoach: true, weightSince: '2026-01-05T08:00:00Z' });
    api.setSharing.mockResolvedValue({ weightToCoach: false, weightSince: null });
    renderPage(<WeightSharingSection />);
    const sw = await screen.findByRole('switch', { name: 'Évolution de mon poids' });
    await waitFor(() => expect(sw).toBeChecked());
    fireEvent.click(sw);
    await waitFor(() => expect(api.setSharing).toHaveBeenCalledTimes(1));
    expect(api.setSharing.mock.calls[0][0]).toBe(false);
    await waitFor(() => expect(sw).not.toBeChecked());
  });
});
