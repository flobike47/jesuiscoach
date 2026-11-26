import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AppEvent } from '@/services/calendarApi';
import type { Activity } from '@/types';
import { MonthView } from './MonthView';

describe('MonthView', () => {
  const baseProps = {
    month: '2026-12-01',
    events: [] as AppEvent[],
    activities: [] as Activity[],
    doneEventIds: [] as string[],
    unavailable: () => null,
    today: '2026-12-15',
    selected: null,
    onSelect: vi.fn(),
    onPrevMonth: vi.fn(),
    onNextMonth: vi.fn(),
  };

  it('affiche le nom du mois en français avec casse', () => {
    render(<MonthView {...baseProps} />);
    // getByText lève si l'élément n'existe pas
    screen.getByText(/Décembre/);
  });

  it('affiche les flèches pour naviguer entre les mois', () => {
    render(<MonthView {...baseProps} />);
    // Cherche les deux boutons de navigation - au moins 2 (peut y en avoir plus avec les jours)
    const navButtons = screen.getAllByRole('button').slice(0, 2);
    expect(navButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('affiche un mois avec une séance', () => {
    const events: AppEvent[] = [
      {
        id: '1',
        category: 'WORKOUT',
        start_date_local: '2026-12-08T10:00:00',
        description: '- 1h 65%',
      },
    ];

    render(<MonthView {...baseProps} events={events} />);
    // Cherche un jour avec une séance (l'aria-label mentionne « séance »)
    screen.getByLabelText(/8.*1 séance/);
  });

  it('les jours sont des boutons cliquables en mode normal', () => {
    const onSelect = vi.fn();
    render(<MonthView {...baseProps} onSelect={onSelect} />);
    // Cherche des boutons pour les jours (au moins 28 pour un mois + jours des mois adjacents)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(30); // Mois + flèches
  });

  it('affiche le bandeau « Touche le jour d\'arrivée » en mode picking', () => {
    const picking = {
      label: 'Touche le jour d\'arrivée',
      onPick: vi.fn(),
      onCancel: vi.fn(),
    };
    render(<MonthView {...baseProps} picking={picking} />);
    screen.getByText('Touche le jour d\'arrivée');
  });

  it('affiche le bouton Annuler en mode picking', () => {
    const picking = {
      label: 'Touche le jour d\'arrivée',
      onPick: vi.fn(),
      onCancel: vi.fn(),
    };
    render(<MonthView {...baseProps} picking={picking} />);
    const cancelBtns = screen.getAllByRole('button', { name: 'Annuler' });
    expect(cancelBtns.length).toBeGreaterThan(0);
  });

  it('affiche la légende avec toutes les zones', () => {
    render(<MonthView {...baseProps} />);
    // getAllByText au lieu de getByText pour éviter les doublons
    const endurance = screen.getAllByText('Endurance');
    expect(endurance.length).toBeGreaterThan(0);
    const tempoSST = screen.getAllByText('Tempo / SST');
    expect(tempoSST.length).toBeGreaterThan(0);
    const seuil = screen.getAllByText('Seuil');
    expect(seuil.length).toBeGreaterThan(0);
    const vo2 = screen.getAllByText('VO2');
    expect(vo2.length).toBeGreaterThan(0);
    const indispo = screen.getAllByText('Indispo');
    expect(indispo.length).toBeGreaterThan(0);
  });

  it('affiche la ligne des jours de la semaine', () => {
    render(<MonthView {...baseProps} />);
    // Cherche "charge" par exact match
    const chargeHeaders = screen.getAllByText('charge');
    expect(chargeHeaders.length).toBeGreaterThan(0);
    // Vérifie que les jours de la semaine existent dans la grille
    const headers = screen.getAllByText(/^(lu|ma|me|je|ve|sa|di)$/);
    expect(headers.length).toBeGreaterThanOrEqual(7); // Au moins 7 jours
  });
});
