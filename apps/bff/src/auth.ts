import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { resolveSession } from './sessions.js';
import type { Role } from './db/repo.js';
import { Unauthorized } from './validation.js';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  /** ID Intervals.icu de l'utilisateur (ex. i123456). */
  athleteId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    /** Jeton de session brut (pour la déconnexion). */
    sessionToken?: string;
  }
}

/** Utilisateur fictif du mode démo (jeton `Bearer demo`, accepté seulement si DEMO_MODE=true). */
export const DEMO_USER: AuthUser = {
  id: '00000000-0000-4000-8000-00000000d3e0',
  role: 'coach',
  name: 'Coach démo',
  athleteId: 'demo-0',
};

/** Compte démo côté athlète (`Bearer demo-athlete`) : Julie, coachée par le compte démo. */
export const DEMO_ATHLETE: AuthUser = {
  id: '00000000-0000-4000-8000-00000000d3e1',
  role: 'athlete',
  name: 'Julie',
  athleteId: 'demo-1',
};

/**
 * Routes protégées : /api/* sauf /api/public/*. Le jeton est une session de
 * l'app (sessions.ts), créée après la connexion Intervals.icu.
 */
export function registerAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (req.url.startsWith('/api/public/')) return;

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) {
      reply.code(401).send({ error: 'Session requise' });
      return reply;
    }

    if (config.demoMode && (token === 'demo' || token === 'demo-athlete')) {
      req.user = token === 'demo' ? DEMO_USER : DEMO_ATHLETE;
      return;
    }

    const user = await resolveSession(token);
    if (!user) {
      reply.code(401).send({ error: 'Session expirée' });
      return reply;
    }
    req.user = { id: user.id, role: user.role, name: user.name, athleteId: user.intervals_athlete_id };
    req.sessionToken = token;
  });
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw new Unauthorized();
  return req.user;
}
