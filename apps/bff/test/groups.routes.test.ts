import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { auth, resetDb, setupTestDb } from './helpers.js';

vi.hoisted(() => {
  process.env.DEMO_MODE = 'true';
});

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});

let app: FastifyInstance;
beforeAll(async () => {
  await setupTestDb();
  await resetDb();
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
});
afterAll(() => app.close());

describe('routes groupes (mode démo)', () => {
  it('refuse sans jeton', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/groups' })).statusCode).toBe(401);
  });

  it('refuse pour un athlète (not 403, 200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/groups', headers: auth('token-b') });
    expect(res.statusCode).toBe(403);
  });

  it('renvoie les groupes de démo', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/groups', headers: auth('token-a') });
    expect(res.statusCode).toBe(200);
    const { groups } = res.json();
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBeGreaterThanOrEqual(3); // Route, Gravel, Reprise
    const route = groups.find((g: { name: string }) => g.name === 'Route');
    expect(route?.athleteIds.length).toBeGreaterThanOrEqual(5);
  });

  it('crée un nouveau groupe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: auth('token-a'),
      payload: { name: 'Sprint', athleteIds: ['demo-0', 'demo-1'] },
    });
    expect(res.statusCode).toBe(201);
    const { group } = res.json();
    expect(group.name).toBe('Sprint');
    expect(group.athleteIds).toContain('demo-0');
    expect(group.athleteIds).toContain('demo-1');
  });

  it('valide le nom du groupe', async () => {
    const send = (name: string) =>
      app.inject({
        method: 'POST',
        url: '/api/groups',
        headers: auth('token-a'),
        payload: { name, athleteIds: [] },
      });
    expect((await send('')).statusCode).toBe(400);
    expect((await send('x'.repeat(41))).statusCode).toBe(400);
    expect((await send('Groupe valide')).statusCode).toBe(201);
  });

  it('filtre les athlètes hors équipe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: auth('token-a'),
      payload: { name: 'Test', athleteIds: ['demo-0', 'unknown-999', 'demo-2'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('met à jour le nom d\'un groupe', async () => {
    // Créer d'abord
    const created = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: auth('token-a'),
      payload: { name: 'Old', athleteIds: ['demo-5'] },
    });
    const groupId = created.json().group.id;

    // Mettre à jour
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/groups/${groupId}`,
      headers: auth('token-a'),
      payload: { name: 'New Name' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().group.name).toBe('New Name');
  });

  it('met à jour les membres d\'un groupe', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: auth('token-a'),
      payload: { name: 'Members Test', athleteIds: ['demo-0'] },
    });
    const groupId = created.json().group.id;

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/groups/${groupId}`,
      headers: auth('token-a'),
      payload: { athleteIds: ['demo-1', 'demo-2'] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().group.athleteIds).toEqual(['demo-1', 'demo-2']);
  });

  it('supprime un groupe', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: auth('token-a'),
      payload: { name: 'To Delete', athleteIds: [] },
    });
    const groupId = created.json().group.id;

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/groups/${groupId}`,
      headers: auth('token-a'),
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().ok).toBe(true);
  });

  it('renvoie 404 pour un groupe inexistant', async () => {
    const id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    expect((await app.inject({ method: 'PUT', url: `/api/groups/${id}`, headers: auth('token-a'), payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/groups/${id}`, headers: auth('token-a') })).statusCode).toBe(404);
  });
});
