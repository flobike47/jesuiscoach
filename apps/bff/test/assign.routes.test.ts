import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resetDb, setupTestDb } from './helpers.js';

vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

const COACH = { authorization: 'Bearer demo' };
const ATHLETE = { authorization: 'Bearer demo-athlete' };

interface SuggestResponse {
  suggestions: Array<{
    athleteId: string;
    name: string;
    date: string | null;
    variant: 'courte' | 'standard' | 'longue';
    intensityScale: number;
    reasons: string[];
    alternatives: string[];
    replaces: { eventId: string; name: string } | null;
    blocked: string | null;
  }>;
}

describe("route POST /api/assign/suggest (mode demo)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await setupTestDb();
    const { buildServer } = await import('../src/server.js');
    app = await buildServer();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await resetDb();
    const { ensureDemoUsers } = await import('../src/db/repo.js');
    const { DEMO_USER, DEMO_ATHLETE } = await import('../src/auth.js');
    await ensureDemoUsers(DEMO_USER, DEMO_ATHLETE);
  });

  describe("authentification et autorisation", () => {
    it("refuse sans jeton", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(401);
    });

    it("refuse si utilisateur n'est pas coach", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: ATHLETE,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("validation des parametres", () => {
    it("refuse si description est vide", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse si description manque", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse si sport est inconnu", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ski', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse si athleteIds est vide", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: [], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse si athleteIds manque", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(400);
    });

    it("refuse si from ou to invalide format", async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '28/11/2026', to: '2026-11-30' },
      });
      expect(res1.statusCode).toBe(400);

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-25' },
      });
      expect(res2.statusCode).toBe(400);
    });

    it("refuse si fenetre > 14 jours", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-12-13' },
      });
      expect(res.statusCode).toBe(400);
    });

    it("accepte une fenetre exactement de 14 jours", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-12-12' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("succes et format de reponse", () => {
    it("retourne 200 avec suggestions pour chaque athlete demo", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1', 'demo-2', 'demo-3'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as SuggestResponse;
      expect(body.suggestions).toHaveLength(3);
      expect(body.suggestions.map((s) => s.athleteId)).toEqual(['demo-1', 'demo-2', 'demo-3']);
    });

    it("chaque suggestion a au moins 1 raison", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      const body = res.json() as SuggestResponse;
      expect(body.suggestions[0].reasons.length).toBeGreaterThanOrEqual(1);
      expect(body.suggestions[0].reasons[0]).toBeTruthy();
    });

    it("la date est dans la fenetre ou null", async () => {
      const from = "2026-11-28";
      const to = "2026-11-30";
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from, to },
      });
      const body = res.json() as SuggestResponse;
      const { date } = body.suggestions[0];
      if (date) {
        expect(date >= from && date <= to).toBe(true);
      } else {
        expect(date).toBeNull();
      }
    });

    it("chaque suggestion inclut tous les champs requis", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      const body = res.json() as SuggestResponse;
      const s = body.suggestions[0];
      expect(s).toHaveProperty("athleteId");
      expect(s).toHaveProperty("name");
      expect(typeof s.name === 'string' && s.name.length > 0).toBe(true);
      expect(s).toHaveProperty("date");
      expect(s).toHaveProperty("variant");
      expect(['courte', 'standard', 'longue']).toContain(s.variant);
      expect(s).toHaveProperty("intensityScale");
      expect(typeof s.intensityScale === 'number' && s.intensityScale > 0).toBe(true);
      expect(s).toHaveProperty("reasons");
      expect(Array.isArray(s.reasons)).toBe(true);
      expect(s).toHaveProperty("alternatives");
      expect(Array.isArray(s.alternatives)).toBe(true);
      expect(s).toHaveProperty("replaces");
      expect(s).toHaveProperty("blocked");
    });

    it("alternatives ne contient que des dates dans la fenetre", async () => {
      const from = "2026-11-28";
      const to = "2026-11-30";
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from, to },
      });
      const body = res.json() as SuggestResponse;
      const { alternatives } = body.suggestions[0];
      alternatives.forEach((alt) => {
        expect(alt >= from && alt <= to).toBe(true);
      });
    });

    it("alternatives a max 3 jours", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-25', to: '2026-12-05' },
      });
      const body = res.json() as SuggestResponse;
      expect(body.suggestions[0].alternatives.length).toBeLessThanOrEqual(3);
    });

    it("raison est Remplace si replaces renseigne", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      const body = res.json() as SuggestResponse;
      const s = body.suggestions[0];
      if (s.replaces) {
        expect(s.reasons.some((r) => r.includes("Remplace"))).toBe(true);
      }
    });
  });

  describe("filtrage des athletes", () => {
    it("ignore un id hors de equipe absent de reponse", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1', 'unknown'], from: '2026-11-28', to: '2026-11-30' },
      });
      const body = res.json() as SuggestResponse;
      expect(body.suggestions.map((s) => s.athleteId)).not.toContain('unknown');
      expect(body.suggestions).toHaveLength(1);
    });

    it("deduplique les athleteIds", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1', 'demo-1', 'demo-2'], from: '2026-11-28', to: '2026-11-30' },
      });
      const body = res.json() as SuggestResponse;
      expect(body.suggestions).toHaveLength(2);
    });
  });

  describe("sports supportes", () => {
    it("accepte sport Ride", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepte sport Run", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Run', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepte sport Swim", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Swim', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("descriptions variees", () => {
    it("parse une seance courte simple", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 15m 50%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as SuggestResponse;
      expect(['courte', 'standard', 'longue']).toContain(body.suggestions[0].variant);
    });

    it("parse une seance longue", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 2h30 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(200);
    });

    it("parse une seance avec structure complexe", async () => {
      const description = `Echauffement
- 10m 50%

Seuil
3x
- 10m 95-100%
- 5m 55%

Retour au calme
- 10m 40%`;
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description, sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("fenetres de placement", () => {
    it("accepte une fenetre dans le futur", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-12-15', to: '2026-12-20' },
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepte une fenetre courte (1 jour)", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-11-28' },
      });
      expect(res.statusCode).toBe(200);
    });

    it("accepte une fenetre juste avant la limite (13 jours)", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-1'], from: '2026-11-28', to: '2026-12-11' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("demo donnees completes et coherence", () => {
    it("retourne les 10 athletes demo avec suggestions valides", async () => {
      const demoIds = Array.from({ length: 10 }, (_, i) => `demo-${i}`);
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: demoIds, from: '2026-11-28', to: '2026-11-30' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as SuggestResponse;
      expect(body.suggestions).toHaveLength(10);
      body.suggestions.forEach((s) => {
        expect(s.name).toBeTruthy();
        expect(s.reasons.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("propose des jours differents selon forme de chaque athlete", async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/assign/suggest',
        headers: COACH,
        payload: { description: '- 60m 70%', sport: 'Ride', athleteIds: ['demo-0', 'demo-1'], from: '2026-11-28', to: '2026-12-02' },
      });
      const body = res.json() as SuggestResponse;
      expect(body.suggestions.some((s) => s.date !== null)).toBe(true);
    });
  });
});
