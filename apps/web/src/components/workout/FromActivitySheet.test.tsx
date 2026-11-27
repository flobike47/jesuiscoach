import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FromActivitySheet } from './FromActivitySheet';

const iv = (start: number, duration: number, watts: number) => ({ label: '', start, end: start + duration, duration, watts, weightedWatts: watts, heartrate: null, cadence: null, zone: 4 });

const ftp = vi.hoisted(() => ({ value: 230 as number | null }));

vi.mock('@/hooks/useCoach', () => ({
  useTeam: () => ({ data: { athletes: [{ id: 'a', name: 'Hugo', weekHours: 8.5 }] } }),
  useAthleteOverview: (id?: string) => ({
    isLoading: false,
    data: id
      ? {
          summary: { ftp: ftp.value },
          activities: [{ id: 'act-1', name: 'Seuil du mardi', start_date_local: '2026-11-24T18:00:00', moving_time: 5400, icu_weighted_avg_watts: 205, icu_training_load: 95 }],
        }
      : undefined,
  }),
  useActivityDetail: (id?: string, activityId?: string) => ({
    isLoading: false,
    data: id && activityId ? { activity: { name: 'Seuil du mardi' }, intervals: [iv(900, 720, 210), iv(1860, 720, 214), iv(2820, 715, 209)] } : undefined,
  }),
}));

afterEach(() => {
  cleanup();
  ftp.value = 230;
});

const pickHugoThenRide = () => {
  fireEvent.click(screen.getByText('Hugo'));
  fireEvent.click(screen.getByText('Seuil du mardi'));
};

describe('FromActivitySheet', () => {
  it('reprend les intervalles de la sortie choisie en séance', () => {
    const onPick = vi.fn();
    render(<FromActivitySheet onClose={() => {}} onPick={onPick} />);
    pickHugoThenRide();
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser cette séance' }));
    expect(onPick).toHaveBeenCalledWith({ name: 'Seuil du mardi (reprise)', description: expect.stringContaining('3x\n- 12m 92%') });
  });

  it('explique pourquoi rien ne peut être repris sans FTP', () => {
    ftp.value = null;
    render(<FromActivitySheet onClose={() => {}} onPick={() => {}} />);
    pickHugoThenRide();
    expect(screen.getByText(/FTP inconnue/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Utiliser cette séance' })).not.toBeInTheDocument();
  });

  it('revient à la liste des sorties puis des athlètes', () => {
    render(<FromActivitySheet onClose={() => {}} onPick={() => {}} />);
    pickHugoThenRide();
    fireEvent.click(screen.getByRole('button', { name: '‹ Sorties' }));
    fireEvent.click(screen.getByRole('button', { name: '‹ Athlètes' }));
    expect(screen.getByText('Hugo')).toBeInTheDocument();
  });
});
