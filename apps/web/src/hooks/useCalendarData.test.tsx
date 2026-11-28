import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEventMutations } from './useCalendarData';

/** Suppression : un refus d'Intervals.icu (`ok: false`, réponse 200 du BFF) est un échec pour l'écran. */

const api = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; error?: string } }));

vi.mock('@/services/calendarApi', () => ({
  calendarApi: { deleteEvent: async () => api.result },
}));

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

describe('useEventMutations().remove', () => {
  it('réussit quand le BFF a supprimé', async () => {
    api.result = { ok: true };
    const { result } = renderHook(() => useEventMutations(), { wrapper });
    await expect(result.current.remove.mutateAsync({ athleteId: 'a', eventId: 'e' })).resolves.toEqual({ ok: true });
  });

  it('échoue avec le message du BFF quand Intervals.icu refuse', async () => {
    api.result = { ok: false, error: 'Intervals.icu indisponible' };
    const { result } = renderHook(() => useEventMutations(), { wrapper });
    await expect(result.current.remove.mutateAsync({ athleteId: 'a', eventId: 'e' })).rejects.toThrow('Intervals.icu indisponible');
  });

  it('a un message par défaut si le BFF n’en donne pas', async () => {
    api.result = { ok: false };
    const { result } = renderHook(() => useEventMutations(), { wrapper });
    await expect(result.current.remove.mutateAsync({ athleteId: 'a', eventId: 'e' })).rejects.toThrow(/Suppression chez Intervals\.icu impossible/);
  });
});
