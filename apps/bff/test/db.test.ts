import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { consumeInvitation, insertInvitation, upsertUser } from '../src/db/repo.js';
import { USER_A, USER_B, resetDb, rows, setupTestDb } from './helpers.js';

let db: Db;
beforeAll(async () => {
  db = await setupTestDb();
});
beforeEach(() => resetDb());

describe('migrations', () => {
  it('ne rejoue pas une migration déjà appliquée', async () => {
    expect(await migrate(db)).toEqual([]);
    expect((await rows('schema_migrations')).map((r) => r.version)).toContain('001_initial.sql');
  });
});

describe('contraintes', () => {
  it('supprime en cascade les données d’un utilisateur', async () => {
    await db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/x', 'k', 'a')`, [USER_B]);
    await db.query('delete from users where id = $1', [USER_B]);
    expect(await rows('push_subscriptions')).toEqual([]);
    expect((await rows('sessions')).map((s) => s.user_id)).toEqual([USER_A]);
  });

  it('refuse un rôle ou un ID Intervals invalides', async () => {
    await expect(db.query(`insert into users (intervals_athlete_id, name, role) values ('i9', 'X', 'admin')`)).rejects.toThrow();
    await expect(db.query(`insert into users (intervals_athlete_id, name) values ('i 9;', 'X')`)).rejects.toThrow();
  });

  it('interdit à un coach de se coacher lui-même', async () => {
    await expect(db.query('insert into coach_athletes (coach_id, athlete_id) values ($1, $1)', [USER_A])).rejects.toThrow();
  });
});

describe('repo', () => {
  it('ne rétrograde jamais un coach existant', async () => {
    expect((await upsertUser('iA', 'Coach A', false)).role).toBe('coach');
    expect((await upsertUser('iB', 'Athlète B', true)).role).toBe('coach');
  });

  it('ne consomme une invitation qu’une seule fois', async () => {
    await insertInvitation('invite-123456', USER_A, new Date(Date.now() + 60_000));
    const results = await Promise.all([consumeInvitation('invite-123456', USER_B), consumeInvitation('invite-123456', USER_B)]);
    expect(results.filter(Boolean)).toEqual([USER_A]);
  });
});
