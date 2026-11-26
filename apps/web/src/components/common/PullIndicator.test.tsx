import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PullIndicator } from './PullIndicator';

describe('PullIndicator', () => {
  beforeEach(() => {
    // Mock matchMedia pour prefers-reduced-motion (désactivé par défaut)
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche le spinner avec le label correct quand pullPosition > 0', () => {
    render(<PullIndicator pullPosition={32} isRefreshing={false} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('Tirez pour actualiser');
  });

  it('affiche le label de rafraîchissement quand isRefreshing est true', () => {
    cleanup();
    render(<PullIndicator pullPosition={0} isRefreshing={true} />);
    const status = screen.queryByRole('status');
    expect(status?.getAttribute('aria-label')).toBe('Actualisation en cours');
  });

  it('a une opacité nulle au repos', () => {
    const { container } = render(<PullIndicator pullPosition={0} isRefreshing={false} />);
    const indicator = container.querySelector('[role="status"]') as HTMLElement;
    expect(indicator?.style.opacity).toBe('0');
  });

  it('a une opacité de 1 pendant le rafraîchissement', () => {
    const { container } = render(<PullIndicator pullPosition={0} isRefreshing={true} />);
    const indicator = container.querySelector('[role="status"]') as HTMLElement;
    expect(indicator?.style.opacity).toBe('1');
  });

  it('calcule l\'opacité proportionnellement au tirage', () => {
    const { container: container1 } = render(<PullIndicator pullPosition={32} isRefreshing={false} threshold={64} />);
    const indicator1 = container1.querySelector('[role="status"]') as HTMLElement;
    // 32/64 * 1.2 = 0.6
    expect(indicator1?.style.opacity).toBe('0.6');

    const { container: container2 } = render(<PullIndicator pullPosition={16} isRefreshing={false} threshold={64} />);
    const indicator2 = container2.querySelector('[role="status"]') as HTMLElement;
    // 16/64 * 1.2 = 0.3
    expect(indicator2?.style.opacity).toBe('0.3');
  });

  it('positionne le spinner sous la barre de navigation', () => {
    const { container } = render(<PullIndicator pullPosition={0} isRefreshing={false} />);
    const indicator = container.querySelector('[role="status"]') as HTMLElement;
    // jsdom ne parse pas env(), donc on vérifie juste le contenu
    expect(indicator?.style.top).toContain('calc');
  });

  it('translateY diminue pendant le tirage', () => {
    const { container } = render(<PullIndicator pullPosition={32} isRefreshing={false} threshold={64} />);
    const indicator = container.querySelector('[role="status"]') as HTMLElement;
    // translateY = 32 - 64 = -32
    expect(indicator?.style.transform).toBe('translateY(-32px)');
  });

  it('fixe la position quand isRefreshing est true', () => {
    const { container } = render(<PullIndicator pullPosition={32} isRefreshing={true} threshold={64} />);
    const indicator = container.querySelector('[role="status"]') as HTMLElement;
    // translateY = 64 - 64 = 0
    expect(indicator?.style.transform).toBe('translateY(0px)');
  });
});
