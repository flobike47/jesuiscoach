import { randomUUID } from 'node:crypto';
import type { GroupWithMembers } from './db/groupRepo.js';

/**
 * Groupes d'athlètes en mémoire pour la démo (mode DEMO_MODE=true).
 * Pré-chargés avec « Route » (6 athlètes), « Gravel » (3), « Reprise » (1).
 * Données de démo stables (UUID générées une fois au démarrage).
 */

interface DemoGroupStore {
  groups: Map<string, GroupWithMembers>;
  athleteToGroups: Map<string, Set<string>>;
}

const demoStore: DemoGroupStore = {
  groups: new Map(),
  athleteToGroups: new Map(),
};

function initDemoGroups() {
  if (demoStore.groups.size > 0) return;

  const route: GroupWithMembers = {
    id: randomUUID(),
    name: 'Route',
    athleteIds: ['demo-0', 'demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5'],
  };

  const gravel: GroupWithMembers = {
    id: randomUUID(),
    name: 'Gravel',
    athleteIds: ['demo-6', 'demo-7', 'demo-8'],
  };

  const reprise: GroupWithMembers = {
    id: randomUUID(),
    name: 'Reprise',
    athleteIds: ['demo-9'],
  };

  for (const group of [route, gravel, reprise]) {
    demoStore.groups.set(group.id, group);
    for (const athleteId of group.athleteIds) {
      if (!demoStore.athleteToGroups.has(athleteId)) {
        demoStore.athleteToGroups.set(athleteId, new Set());
      }
      demoStore.athleteToGroups.get(athleteId)!.add(group.id);
    }
  }
}

/** Tous les groupes du coach en démo. */
export function demoListGroups(): GroupWithMembers[] {
  initDemoGroups();
  return Array.from(demoStore.groups.values());
}

/** Un groupe par id, ou null si absent. */
export function demoGetGroup(groupId: string): GroupWithMembers | null {
  initDemoGroups();
  return demoStore.groups.get(groupId) ?? null;
}

/** IDs des groupes contenant cet athlète. */
export function demoGroupsOf(athleteId: string): string[] {
  initDemoGroups();
  return Array.from(demoStore.athleteToGroups.get(athleteId) ?? new Set());
}

/** Crée un groupe en démo. */
export function demoInsertGroup(name: string): GroupWithMembers {
  initDemoGroups();
  const group: GroupWithMembers = {
    id: randomUUID(),
    name,
    athleteIds: [],
  };
  demoStore.groups.set(group.id, group);
  return group;
}

/** Met à jour un groupe en démo. */
export function demoUpdateGroup(groupId: string, name: string | undefined, athleteIds: string[] | undefined): GroupWithMembers {
  initDemoGroups();
  const group = demoStore.groups.get(groupId);
  if (!group) throw new Error('Group not found');

  if (name !== undefined) {
    group.name = name;
  }

  if (athleteIds !== undefined) {
    // Mettre à jour le reverse mapping
    for (const oldId of group.athleteIds) {
      demoStore.athleteToGroups.get(oldId)?.delete(groupId);
    }

    group.athleteIds = athleteIds;
    for (const newId of athleteIds) {
      if (!demoStore.athleteToGroups.has(newId)) {
        demoStore.athleteToGroups.set(newId, new Set());
      }
      demoStore.athleteToGroups.get(newId)!.add(groupId);
    }
  }

  return group;
}

/** Supprime un groupe en démo. */
export function demoDeleteGroup(groupId: string): void {
  initDemoGroups();
  const group = demoStore.groups.get(groupId);
  if (!group) throw new Error('Group not found');

  for (const athleteId of group.athleteIds) {
    demoStore.athleteToGroups.get(athleteId)?.delete(groupId);
  }

  demoStore.groups.delete(groupId);
}

/** Nombre total de groupes en démo. */
export function demoCountGroups(): number {
  initDemoGroups();
  return demoStore.groups.size;
}

/** Récupère les IDs des groupes d'un athlète en démo. */
export function demoGetGroupIds(athleteId: string): string[] {
  return demoGroupsOf(athleteId);
}
