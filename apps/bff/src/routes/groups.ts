import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { config } from '../config.js';
import {
  countGroupsOf,
  deleteGroup,
  getGroup,
  insertGroup,
  listGroupsOf,
  updateGroup,
  type GroupWithMembers,
} from '../db/groupRepo.js';
import {
  demoCountGroups,
  demoDeleteGroup,
  demoGetGroup,
  demoInsertGroup,
  demoListGroups,
  demoUpdateGroup,
} from '../demoGroups.js';
import { teamOf } from '../sources.js';
import { BadRequest, Forbidden, NotFound, clampArray, validateString, validateUuid } from '../validation.js';

/**
 * Routes de gestion des groupes d'athlètes (phase E).
 * Coach seulement (403 sinon). Athlètes filtrés sur l'équipe du coach.
 * Limites : nom 1–40 car., max 20 groupes, max 50 membres.
 */

const MAX_GROUPS = 20;
const MAX_MEMBERS_PER_GROUP = 50;
const MAX_NAME_LENGTH = 40;
const MIN_NAME_LENGTH = 1;

function groupJson(g: GroupWithMembers): { id: string; name: string; athleteIds: string[] } {
  return { id: g.id, name: g.name, athleteIds: g.athleteIds };
}

export async function registerGroupRoutes(app: FastifyInstance) {
  /** Liste tous les groupes du coach. */
  app.get('/groups', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();

    const groups = config.demoMode ? demoListGroups() : await listGroupsOf(me.id);
    return { groups: groups.map(groupJson) };
  });

  /** Crée un nouveau groupe vide ou avec membres. */
  app.post<{ Body: unknown }>('/groups', async (req, reply) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();

    const body = (req.body as Record<string, unknown>) ?? {};
    const name = validateString(body.name as string, 'name', MAX_NAME_LENGTH, MIN_NAME_LENGTH);

    // Valider et borner athleteIds
    let athleteIds: string[] = [];
    if (Array.isArray(body.athleteIds)) {
      athleteIds = clampArray(body.athleteIds, MAX_MEMBERS_PER_GROUP).filter(
        (id): id is string => typeof id === 'string',
      );
    }

    // Vérifier que tous les athletes sont dans l'équipe du coach
    const team = new Set(await teamOf(me));
    const filtered = athleteIds.filter((id) => team.has(id));
    if (filtered.length < athleteIds.length && athleteIds.length > 0) {
      throw new BadRequest('Certains athlètes ne sont pas dans votre équipe');
    }

    // Vérifier la limite de groupes
    const count = config.demoMode ? demoCountGroups() : await countGroupsOf(me.id);
    if (count >= MAX_GROUPS) {
      throw new BadRequest(`Limite de ${MAX_GROUPS} groupes atteinte`);
    }

    const inserted = config.demoMode
      ? demoInsertGroup(name)
      : await insertGroup(me.id, name);

    // Ajouter les membres
    let group = inserted;
    if (filtered.length > 0) {
      group = config.demoMode
        ? demoUpdateGroup(inserted.id, undefined, filtered)
        : await updateGroup(me.id, inserted.id, undefined, filtered);
    }

    reply.code(201);
    return { group: groupJson(group) };
  });

  /** Met à jour un groupe (nom et/ou membres). */
  app.put<{ Params: { id: string }; Body: unknown }>('/groups/:id', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();

    const groupId = validateUuid(req.params.id, 'id');
    const body = (req.body as Record<string, unknown>) ?? {};

    // Vérifier que le groupe existe et appartient au coach
    const existing = config.demoMode ? demoGetGroup(groupId) : await getGroup(me.id, groupId);
    if (!existing) throw new NotFound('Groupe introuvable');

    let name: string | undefined;
    let athleteIds: string[] | undefined;

    if (typeof body.name === 'string') {
      name = validateString(body.name, 'name', MAX_NAME_LENGTH, MIN_NAME_LENGTH);
    }

    if (Array.isArray(body.athleteIds)) {
      athleteIds = clampArray(body.athleteIds, MAX_MEMBERS_PER_GROUP).filter(
        (id): id is string => typeof id === 'string',
      );
      const team = new Set(await teamOf(me));
      const filtered = athleteIds.filter((id) => team.has(id));
      if (filtered.length < athleteIds.length && athleteIds.length > 0) {
        throw new BadRequest('Certains athlètes ne sont pas dans votre équipe');
      }
      athleteIds = filtered;
    }

    const updated = config.demoMode
      ? demoUpdateGroup(groupId, name, athleteIds)
      : await updateGroup(me.id, groupId, name, athleteIds);

    return { group: groupJson(updated) };
  });

  /** Supprime un groupe. */
  app.delete<{ Params: { id: string } }>('/groups/:id', async (req) => {
    const me = requireUser(req);
    if (me.role !== 'coach') throw new Forbidden();

    const groupId = validateUuid(req.params.id, 'id');

    // Vérifier que le groupe existe et appartient au coach
    const existing = config.demoMode ? demoGetGroup(groupId) : await getGroup(me.id, groupId);
    if (!existing) throw new NotFound('Groupe introuvable');

    if (config.demoMode) {
      demoDeleteGroup(groupId);
    } else {
      await deleteGroup(me.id, groupId);
    }

    return { ok: true };
  });
}
