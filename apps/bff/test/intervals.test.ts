import { describe, expect, it, vi } from 'vitest';
import { IntervalsClient, authHeader, usableActivities } from '../src/providers/intervals.js';

/** Faux client axios : enregistre les appels et renvoie `data`. */
function fakeHttp(data: unknown) {
  return {
    defaults: { headers: { common: {} as Record<string, string> } },
    get: vi.fn(async () => ({ data })),
  };
}

describe('client Intervals.icu', () => {
  it("retire les coquilles Strava et les sorties sans type", async () => {
    const http = fakeHttp([
      { id: 'i1', start_date_local: '2026-11-14T08:57:33', type: 'Ride', name: 'Linselles' },
      { id: '1897', start_date_local: '2026-11-10T10:00:00', source: 'STRAVA', _note: 'STRAVA activities are not available via the API' },
      { id: 'i2', start_date_local: '2026-11-09T10:00:00', type: 'Run' },
      { id: 'i3', start_date_local: '2026-11-08T10:00:00' },
    ]);
    const client = new IntervalsClient({ kind: 'apiKey', apiKey: 'k' }, http as never);
    const acts = await client.activities('0', '2026-11-01', '2026-11-25');
    expect(acts.map((a) => a.id)).toEqual(['i1', 'i2']);
    expect(http.get).toHaveBeenCalledWith('/athlete/0/activities', { params: { oldest: '2026-11-01', newest: '2026-11-25' } });
  });

  it('garde une sortie Garmin complète', () => {
    expect(usableActivities([{ id: 'i1', start_date_local: '2026-11-14', type: 'GravelRide', source: 'GARMIN_CONNECT' }])).toHaveLength(1);
  });

  it("s'authentifie en clé API ou en OAuth, avec un user-agent explicite", () => {
    expect(authHeader({ kind: 'apiKey', apiKey: 'abc' })).toBe(`Basic ${Buffer.from('API_KEY:abc').toString('base64')}`);
    expect(authHeader({ kind: 'oauth', accessToken: 'tok' })).toBe('Bearer tok');
    const http = fakeHttp([]);
    new IntervalsClient({ kind: 'oauth', accessToken: 'tok' }, http as never);
    expect(http.defaults.headers.common['User-Agent']).toMatch(/^jesuiscoach\//);
  });
});
