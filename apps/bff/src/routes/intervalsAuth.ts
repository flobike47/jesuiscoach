import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { redis } from '../cache.js';
import { encrypt, parseKey, pkcePair, randomToken } from '../lib/crypto.js';
import { exchangeCode, INTERVALS_BASE } from '../providers/intervals.js';
import { consumeInvitation, deleteUser, findUserByAthlete, invitationIsValid, linkCoachAthlete, saveIntervalsToken, upsertUser } from '../db/repo.js';
import { createSession, revokeSession } from '../sessions.js';
import { requireUser } from '../auth.js';
import { BadRequest, HttpError } from '../validation.js';

/**
 * Connexion « Se connecter avec Intervals.icu ».
 *
 *  1. /start : PKCE + state stockés 10 min dans Redis, redirection vers Intervals.
 *  2. /callback : échange du code (< 2 min), création ou mise à jour de
 *     l'utilisateur, enregistrement du jeton chiffré, puis retour vers le web
 *     avec un code de connexion à usage unique (60 s, dans le fragment #).
 *  3. /exchange : le web échange ce code contre une session (sessions.ts).
 *     La session ne transite jamais dans une URL.
 *
 * Inscription fermée : seuls les coachs (COACH_ATHLETE_IDS) et les personnes
 * munies d'une invitation valide peuvent créer un compte.
 */

export const OAUTH_SCOPES = 'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE,LIBRARY:READ,SETTINGS:READ';
const STATE_TTL = 10 * 60;
const INVITE_RE = /^[A-Za-z0-9_-]{8,64}$/;

class OAuthUnavailable extends HttpError {
  constructor() { super(503, 'Connexion Intervals.icu non configurée sur ce serveur'); }
}

interface PendingLogin {
  verifier: string;
  invite?: string;
}

export const redirectUri = () => `${config.publicApiUrl.replace(/\/$/, '')}/api/public/auth/intervals/callback`;

const LOGIN_CODE_TTL = 60;
const LOGIN_CODE_RE = /^[A-Za-z0-9_-]{20,64}$/;

export async function registerIntervalsAuthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { invite?: string } }>('/public/auth/intervals/start', async (req, reply) => {
    if (!config.intervalsClientId || !config.intervalsClientSecret || !config.tokenEncryptionKey) throw new OAuthUnavailable();
    const invite = req.query.invite && INVITE_RE.test(req.query.invite) ? req.query.invite : undefined;
    const state = randomToken();
    const { verifier, challenge } = pkcePair();
    await redis.setex(`oauth:${state}`, STATE_TTL, JSON.stringify({ verifier, invite } satisfies PendingLogin));

    const url = new URL('/oauth/authorize', INTERVALS_BASE);
    url.search = new URLSearchParams({
      client_id: config.intervalsClientId,
      redirect_uri: redirectUri(),
      scope: OAUTH_SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return reply.redirect(url.href);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/public/auth/intervals/callback',
    async (req, reply) => {
      if (!config.intervalsClientId || !config.intervalsClientSecret || !config.tokenEncryptionKey) throw new OAuthUnavailable();
      const { code, state, error } = req.query;
      if (error) return back(reply, { error: 'refus' });
      if (!code || !state) return back(reply, { error: 'requete_invalide' });

      // State à usage unique : GETDEL empêche le rejeu du même retour OAuth.
      const raw = await redis.getdel(`oauth:${state}`);
      if (!raw) return back(reply, { error: 'session_expiree' });
      const pending = JSON.parse(raw) as PendingLogin;

      let token;
      try {
        token = await exchangeCode({
          clientId: config.intervalsClientId,
          clientSecret: config.intervalsClientSecret,
          code,
          codeVerifier: pending.verifier,
          redirectUri: redirectUri(),
        });
      } catch (e) {
        req.log.warn({ err: e }, 'oauth: échange du code refusé');
        return back(reply, { error: 'echange_refuse' });
      }

      const athleteId = token.athleteId;
      const isCoach = config.coachAthleteIds.includes(athleteId);
      const existing = await findUserByAthlete(athleteId);

      // Inscription fermée : un nouveau compte doit être coach ou invité.
      if (!existing && !isCoach) {
        if (!pending.invite) return back(reply, { error: 'invitation_requise' });
        if (!(await invitationIsValid(pending.invite))) return back(reply, { error: 'invitation_invalide' });
      }

      const user = await upsertUser(athleteId, token.athleteName ?? existing?.name ?? athleteId, isCoach);

      if (!existing && !isCoach && pending.invite) {
        // Consommation atomique : si le lien vient de servir à quelqu'un d'autre, on annule l'inscription.
        const coachId = await consumeInvitation(pending.invite, user.id);
        if (!coachId) {
          await deleteUser(user.id);
          return back(reply, { error: 'invitation_invalide' });
        }
        await linkCoachAthlete(coachId, user.id);
      }

      await saveIntervalsToken(user.id, encrypt(token.accessToken, parseKey(config.tokenEncryptionKey)), token.scope);

      const loginCode = randomToken(24);
      await redis.setex(`login:${loginCode}`, LOGIN_CODE_TTL, user.id);
      // Nouvel athlète invité : le web ouvre l'écran « Bien démarrer ».
      return back(reply, !existing && user.role === 'athlete' ? { code: loginCode, bienvenue: '1' } : { code: loginCode });
    },
  );

  /** Échange le code de connexion (usage unique, 60 s) contre une session. */
  app.post<{ Body: { code?: string } }>('/public/auth/exchange', async (req) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || !LOGIN_CODE_RE.test(code)) throw new BadRequest('code invalide');
    const userId = await redis.getdel(`login:${code}`);
    if (!userId) throw new HttpError(401, 'Code de connexion expiré. Recommence.');
    const session = await createSession(userId, req.headers['user-agent'] ?? null);
    return { token: session };
  });

  /** Déconnexion : la session est supprimée côté serveur. */
  app.post('/auth/logout', async (req) => {
    requireUser(req);
    if (req.sessionToken) await revokeSession(req.sessionToken);
    return { ok: true };
  });
}

/** Retour vers le web. Le jeton passe dans le fragment (#) : jamais envoyé ni journalisé par un serveur. */
function back(reply: FastifyReply, params: Record<string, string>) {
  return reply.redirect(`${config.appUrl}connexion/retour#${new URLSearchParams(params).toString()}`);
}
