import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SwipeRow } from './SwipeRow';

beforeAll(() => {
  // jsdom n'implémente pas la capture de pointeur.
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(cleanup);

const setup = () => {
  const onAction = vi.fn();
  const onOpen = vi.fn();
  render(
    <SwipeRow actionLabel="Planifier" onAction={onAction}>
      <button type="button" onClick={onOpen}>
        Seuil 3×10
      </button>
    </SwipeRow>,
  );
  const row = screen.getByRole('button', { name: 'Seuil 3×10' }).parentElement as HTMLElement;
  return { onAction, onOpen, row };
};

/** Glissé de (200, 100) vers (200 + dx, 100 + dy), puis le clic que la souris émet au relâcher. */
const drag = (row: HTMLElement, dx: number, dy = 0) => {
  fireEvent.pointerDown(row, { clientX: 200, clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(row, { clientX: 200 + dx / 2, clientY: 100 + dy / 2, pointerId: 1 });
  fireEvent.pointerMove(row, { clientX: 200 + dx, clientY: 100 + dy, pointerId: 1 });
  fireEvent.pointerUp(row, { clientX: 200 + dx, clientY: 100 + dy, pointerId: 1 });
  fireEvent.click(row);
};

describe('SwipeRow', () => {
  it('reste ouverte après un glissé à la souris (le clic du relâcher est ignoré)', () => {
    const { row, onOpen } = setup();
    drag(row, -90);
    expect(row.style.transform).toBe('translateX(-104px)');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('se referme si le glissé est trop court', () => {
    const { row } = setup();
    drag(row, -30);
    expect(row.style.transform).toBe('translateX(0px)');
  });

  it('un tap sur une ligne ouverte la referme sans ouvrir la séance', () => {
    const { row, onOpen } = setup();
    drag(row, -90);
    fireEvent.pointerDown(row, { clientX: 150, clientY: 100, pointerId: 2 });
    fireEvent.pointerUp(row, { clientX: 150, clientY: 100, pointerId: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Seuil 3×10' }));
    expect(row.style.transform).toBe('translateX(0px)');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('un tap sur une ligne fermée ouvre la séance', () => {
    const { onOpen } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Seuil 3×10' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('un mouvement vertical laisse défiler sans ouvrir la ligne', () => {
    const { row } = setup();
    drag(row, -20, 80);
    expect(row.style.transform).toBe('translateX(0px)');
  });

  it("l'action déclenche onAction et referme la ligne", () => {
    const { row, onAction } = setup();
    drag(row, -90);
    fireEvent.click(screen.getByRole('button', { name: 'Planifier' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(row.style.transform).toBe('translateX(0px)');
  });
});
