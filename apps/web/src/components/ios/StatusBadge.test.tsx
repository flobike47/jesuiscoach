import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StatusBadge } from './index';

describe('StatusBadge', () => {
  it('affiche le libelle Faite', () => {
    const { container } = render(<StatusBadge status="done" />);
    expect(container.textContent).toContain('Faite');
    cleanup();
  });

  it('affiche le libelle Prevue', () => {
    const { container } = render(<StatusBadge status="planned" />);
    expect(container.textContent).toContain('Prévue');
    cleanup();
  });

  it('affiche le libelle Manquee', () => {
    const { container } = render(<StatusBadge status="missed" />);
    expect(container.textContent).toContain('Manquée');
    cleanup();
  });

  it('affiche le libelle Hors plan', () => {
    const { container } = render(<StatusBadge status="extra" />);
    expect(container.textContent).toContain('Hors plan');
    cleanup();
  });

  it('affiche le libelle A surveiller', () => {
    const { container } = render(<StatusBadge status="watch" />);
    expect(container.textContent).toContain('À surveiller');
    cleanup();
  });

  it('a le rôle d\'un indicateur avec classe CSS', () => {
    const { container } = render(<StatusBadge status="done" />);
    const badge = container.querySelector('.status-badge');
    expect(badge).toBeTruthy();
    cleanup();
  });

  it('utilise les bonnes couleurs et backgrounds', () => {
    const { container } = render(<StatusBadge status="done" />);
    const badge = container.querySelector('.status-badge') as HTMLElement;
    expect(badge?.style.color).toBe('var(--green)');
    expect(badge?.style.background).toContain('green');
    cleanup();
  });
});
