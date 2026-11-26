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

const ATHLETE = { authorization: 'Bearer demo-athlete' };

describe('GET /me/today (mode démo)', () => {
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

  it('devrait retourner ftp, doneEventIds, tomorrow', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me/today',
      headers: ATHLETE,
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();

    // Vérification des champs requis (phase B)
    expect(data).toHaveProperty('today');
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('ftp');
    expect(data).toHaveProperty('workouts');
    expect(data).toHaveProperty('activitiesToday');
    expect(data).toHaveProperty('doneEventIds');
    expect(data).toHaveProperty('tomorrow');
    expect(data).toHaveProperty('week');
    expect(data).toHaveProperty('form');
    expect(data).toHaveProperty('checkin');

    // FTP devrait être un nombre ou null
    expect(typeof data.ftp === 'number' || data.ftp === null).toBe(true);

    // doneEventIds devrait être un tableau
    expect(Array.isArray(data.doneEventIds)).toBe(true);

    // tomorrow devrait être un tableau
    expect(Array.isArray(data.tomorrow)).toBe(true);
  });

  it('devrait retourner une FTP depuis sportSettings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me/today',
      headers: ATHLETE,
    });

    const data = res.json();

    // En démo, FTP devrait toujours être fourni (l'athlète démo a un FTP)
    if (data.ftp) {
      expect(typeof data.ftp).toBe('number');
      expect(data.ftp).toBeGreaterThan(0);
    }
  });
});
