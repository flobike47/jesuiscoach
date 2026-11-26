import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { countGroupsOf, deleteGroup, getGroupIds, insertGroup, listGroupsOf, updateGroup } from '../src/db/groupRepo.js';
import { USER_A, USER_B, resetDb, setupTestDb } from './helpers.js';

/** Groupes en vraie base (hors démo) : identifiants Intervals.icu, isolation par coach. */
describe('groupRepo (Postgres)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(() => resetDb());

  it('enregistre les membres par identifiant Intervals.icu', async () => {
    const g = await insertGroup(USER_A, 'Route');
    await updateGroup(USER_A, g.id, undefined, ['iB']);
    expect((await listGroupsOf(USER_A))[0].athleteIds).toEqual(['iB']);
    expect(await getGroupIds(USER_A, 'iB')).toEqual([g.id]);
    expect(await countGroupsOf(USER_A)).toBe(1);
  });

  it("n'expose jamais les groupes d'un autre coach", async () => {
    const g = await insertGroup(USER_A, 'Route');
    await updateGroup(USER_A, g.id, undefined, ['iB']);
    expect(await getGroupIds(USER_B, 'iB')).toEqual([]);
    expect(await listGroupsOf(USER_B)).toEqual([]);
    await expect(deleteGroup(USER_B, g.id)).rejects.toThrow();
    await expect(updateGroup(USER_B, g.id, undefined, [])).rejects.toThrow();
    expect((await listGroupsOf(USER_A))[0].athleteIds).toEqual(['iB']);
  });
});
