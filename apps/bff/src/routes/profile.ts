import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser, type AuthUser } from '../auth.js';
import { config } from '../config.js';
import { dbProfileStore } from '../db/profileRepo.js';
import { findUserByAthlete } from '../db/repo.js';
import { demoProfileStore } from '../demoProfile.js';
import {
  BOUNDS,
  compareWithIntervals,
  intervalsIdentityPatch,
  intervalsSportPatch,
  parseIdentityPatch,
  parsePhysioPatch,
  parseTest,
  parseVma,
  physioSport,
  snapshotOf,
  testTarget,
  wellnessPatch,
  type IdentityValues,
  type PhysioValues,
  type ProfileStore,
  type ProfileValues,
  type StoredProfile,
  type UpdatedBy,
} from '../lib/profile.js';
import { isoDay } from '../lib/summary.js';
import { SPORTS, type Sport } from '../lib/sport.js';
import { ProviderError } from '../providers/http.js';
import { enforceQuota, QuotaExceeded } from '../ratelimit.js';
import { assertCanView, NotConnected, sourceFor } from '../sources.js';
import { ATHLETE_ID_RE, BadRequest, Conflict, NotFound, validateUuid } from '../validation.js';

/**
 * Fiche profil de l'athlète : identité, physiologie, VMA et tests. L'app est
 * la source de vérité ; chaque modification est enregistrée puis poussée vers
 * Intervals.icu (puis la montre). Un échec d'envoi n'annule pas la sauvegarde :
 * il est noté dans `sync.error`.
 *
 * Accès : l'athlète lui-même ou son coach (assertCanView). Le coach qui
 * modifie la fiche laisse `updated_by = 'coach'`.
 */

const SCOPE_SETTINGS = 'SETTINGS:WRITE';
const SCOPE_WELLNESS = 'WELLNESS:WRITE';
const IDENTITY_FIELDS = ['birthDate', 'sex', 'heightCm', 'weightKg', 'restingHr'] as const;
const PHYSIO_FIELDS = ['ftp', 'lthr', 'maxHr', 'thresholdSecs'] as const;

interface Ctx {
  me: AuthUser;
  athleteId: string;
  store: ProfileStore;
  by: UpdatedBy;
}

/** Contexte d'une requête : athlète autorisé, fiche (base ou démo), auteur de la modification. */
async function ctxOf(req: FastifyRequest, athleteIdParam: string): Promise<Ctx> {
  const me = requireUser(req);
  if (!ATHLETE_ID_RE.test(athleteIdParam)) throw new BadRequest('id invalide');
  await assertCanView(me, athleteIdParam);
  let store: ProfileStore;
  if (config.demoMode) {
    store = demoProfileStore(athleteIdParam);
  } else {
    const user = await findUserByAthlete(athleteIdParam);
    if (!user) throw new NotFound('Athlète introuvable');
    store = dbProfileStore(user.id);
  }
  return { me, athleteId: athleteIdParam, store, by: me.athleteId === athleteIdParam ? 'athlete' : 'coach' };
}

/** Valeurs actuelles d'Intervals.icu (lecture en cache, 6 h). */
async function intervalsValues(athleteId: string): Promise<ProfileValues> {
  const info = await (await sourceFor(athleteId)).athlete(athleteId);
  return snapshotOf(info, isoDay(new Date()));
}

/** Première ouverture : copie les valeurs d'Intervals.icu dans la fiche. */
async function ensureImported(ctx: Ctx): Promise<StoredProfile> {
  let stored = await ctx.store.load();
  if (!stored) {
    await ctx.store.importInitial(await intervalsValues(ctx.athleteId));
    stored = await ctx.store.load();
  }
  if (!stored) throw new Conflict('Fiche profil indisponible, réessaie');
  return stored;
}

const grantedOf = (scope: string) => new Set(scope.split(/[\s,]+/).filter(Boolean));

/** Message court, sans jeton ni détail amont, pour `sync_error`. */
function syncErrorMessage(err: unknown): string {
  if (err instanceof NotConnected) return 'Compte Intervals.icu non connecté : reconnecte-le.';
  if (err instanceof QuotaExceeded) return "Quota d'envois atteint pour aujourd'hui : réessaie demain.";
  if (err instanceof ProviderError) {
    if (err.status === 401 || err.status === 403) return 'Intervals.icu refuse l’accès : reconnecte ton compte.';
    if (err.status === 429) return 'Intervals.icu limite les envois pour le moment : réessaie plus tard.';
    if (err.status >= 500) return 'Intervals.icu est injoignable pour le moment.';
    return `Intervals.icu a refusé la valeur (erreur ${err.status}).`;
  }
  return 'Envoi vers Intervals.icu impossible pour le moment.';
}

interface SyncStep {
  /** Scope OAuth nécessaire à cet appel. */
  needs: string;
  write: () => Promise<void>;
}

/**
 * Pousse les écritures vers Intervals.icu, dans l'ordre. Une étape dont le
 * scope n'est pas accordé est ignorée (reconnexion nécessaire). Une erreur
 * arrête la série et est notée dans `sync_error` ; la sauvegarde reste.
 */
async function pushSteps(ctx: Ctx, steps: SyncStep[]): Promise<void> {
  const granted = grantedOf(await ctx.store.scope());
  let ran = false;
  let error: string | null = null;
  for (const step of steps) {
    if (!granted.has(step.needs)) continue;
    try {
      await enforceQuota(ctx.me.id, 'editCalendar');
      await step.write();
      ran = true;
    } catch (err) {
      error = syncErrorMessage(err);
      break;
    }
  }
  if (error) await ctx.store.setSync({ error });
  else if (ran) await ctx.store.setSync({ syncedAt: new Date(), error: null });
}

/** Réponse complète de la fiche (lecture après écriture incluse). */
async function view(ctx: Ctx, stored: StoredProfile): Promise<Record<string, unknown>> {
  const scope = grantedOf(await ctx.store.scope());
  let intervals: ProfileValues | null = null;
  try {
    intervals = await intervalsValues(ctx.athleteId);
  } catch {
    // Intervals.icu injoignable ou compte non connecté : la fiche reste utilisable sans comparaison.
    intervals = null;
  }
  const profile: ProfileValues = { identity: stored.identity, physiology: stored.physiology };
  return {
    identity: stored.identity,
    physiology: stored.physiology,
    vmaKmh: stored.vmaKmh,
    intervals: intervals ? { ...intervals.physiology, ...intervals.identity } : null,
    suggestions: intervals ? compareWithIntervals(profile, intervals) : [],
    sync: {
      syncedAt: stored.sync.syncedAt,
      error: stored.sync.error,
      needsReconnect: !scope.has(SCOPE_SETTINGS) || !scope.has(SCOPE_WELLNESS),
    },
    updatedBy: stored.updatedBy,
    updatedAt: stored.updatedAt,
  };
}

async function reload(ctx: Ctx): Promise<StoredProfile> {
  const stored = await ctx.store.load();
  if (!stored) throw new Conflict('Fiche profil indisponible, réessaie');
  return stored;
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/athletes/:id/profile', async (req) => {
    const ctx = await ctxOf(req, req.params.id);
    return view(ctx, await ensureImported(ctx));
  });

  app.put<{ Params: { id: string }; Body: unknown }>('/athletes/:id/profile/identity', async (req) => {
    const ctx = await ctxOf(req, req.params.id);
    const today = isoDay(new Date());
    const patch = parseIdentityPatch(req.body, today);
    await ensureImported(ctx);
    await ctx.store.saveIdentity(patch, ctx.by);

    const athletePatch = intervalsIdentityPatch(patch);
    const wp = wellnessPatch(patch);
    const id = ctx.athleteId;
    const steps: SyncStep[] = [];
    if (Object.keys(athletePatch).length > 0) {
      steps.push({ needs: SCOPE_SETTINGS, write: async () => (await sourceFor(id)).updateAthleteProfile(id, athletePatch) });
    }
    if (Object.keys(wp).length > 0) {
      steps.push({ needs: SCOPE_WELLNESS, write: async () => (await sourceFor(id)).updateWellness(id, today, wp) });
    }
    await pushSteps(ctx, steps);
    return view(ctx, await reload(ctx));
  });

  app.put<{ Params: { id: string; sport: string }; Body: unknown }>('/athletes/:id/profile/physiology/:sport', async (req) => {
    const ctx = await ctxOf(req, req.params.id);
    const sport = physioSport(req.params.sport);
    const patch = parsePhysioPatch(sport, req.body);
    await ensureImported(ctx);
    await ctx.store.savePhysiology(sport, patch, ctx.by);

    const sportPatch = intervalsSportPatch(sport, patch);
    const id = ctx.athleteId;
    const steps: SyncStep[] =
      Object.keys(sportPatch).length > 0 ? [{ needs: SCOPE_SETTINGS, write: async () => (await sourceFor(id)).updateSportSettings(id, sport, sportPatch) }] : [];
    await pushSteps(ctx, steps);
    return view(ctx, await reload(ctx));
  });

  /** VMA : reste dans l'app (Intervals.icu n'a pas de champ équivalent). */
  app.put<{ Params: { id: string }; Body: unknown }>('/athletes/:id/profile/vma', async (req) => {
    const ctx = await ctxOf(req, req.params.id);
    const vmaKmh = parseVma(req.body);
    await ensureImported(ctx);
    await ctx.store.saveVma(vmaKmh, ctx.by);
    return view(ctx, await reload(ctx));
  });

  /** Accepte la valeur d'Intervals.icu : copie dans l'app, sans renvoi. */
  app.post<{ Params: { id: string }; Body: { sport?: unknown; field?: unknown } }>('/athletes/:id/profile/suggestions/accept', async (req) => {
    const ctx = await ctxOf(req, req.params.id);
    const body = req.body ?? {};
    const field = body.field;
    const sport = body.sport ?? null;
    if (typeof field !== 'string' || !([...IDENTITY_FIELDS, ...PHYSIO_FIELDS] as string[]).includes(field)) throw new BadRequest('champ invalide');
    if (sport !== null && (typeof sport !== 'string' || !(SPORTS as readonly string[]).includes(sport))) throw new BadRequest('sport invalide');
    await ensureImported(ctx);
    const stored = await reload(ctx);
    const profile: ProfileValues = { identity: stored.identity, physiology: stored.physiology };
    const suggestion = compareWithIntervals(profile, await intervalsValues(ctx.athleteId)).find((s) => s.sport === sport && s.field === field);
    if (!suggestion) throw new Conflict('Plus de suggestion à accepter pour ce champ');
    if (sport) {
      await ctx.store.savePhysiology(sport as Sport, { [field]: suggestion.intervalsValue } as Partial<PhysioValues>, 'intervals');
    } else {
      await ctx.store.saveIdentity({ [field]: suggestion.intervalsValue } as Partial<IdentityValues>, 'intervals');
    }
    return view(ctx, await reload(ctx));
  });

  app.get<{ Params: { id: string } }>('/athletes/:id/profile/tests', async (req) => {
    const ctx = await ctxOf(req, req.params.id);
    return { tests: await ctx.store.tests(), max: BOUNDS.maxTests };
  });

  /** Ajoute un test ; `apply` met aussi à jour la valeur correspondante du profil. */
  app.post<{ Params: { id: string }; Body: unknown }>('/athletes/:id/profile/tests', async (req, reply) => {
    const ctx = await ctxOf(req, req.params.id);
    const { test, apply } = parseTest(req.body, isoDay(new Date()));
    await ensureImported(ctx);
    const row = await ctx.store.addTest(test, BOUNDS.maxTests);
    if (!row) throw new Conflict(`${BOUNDS.maxTests} tests au plus : supprime un ancien test`);

    const target = apply ? testTarget(test.kind) : null;
    if (target && 'vma' in target) {
      await ctx.store.saveVma(test.value, ctx.by);
    } else if (target) {
      const { sport, field } = target;
      const value = field === 'thresholdSecs' || field === 'ftp' || field === 'lthr' ? Math.round(test.value) : test.value;
      const patch = { [field]: value } as Partial<PhysioValues>;
      await ctx.store.savePhysiology(sport, patch, ctx.by);
      const sportPatch = intervalsSportPatch(sport, patch);
      const id = ctx.athleteId;
      if (Object.keys(sportPatch).length > 0) {
        await pushSteps(ctx, [{ needs: SCOPE_SETTINGS, write: async () => (await sourceFor(id)).updateSportSettings(id, sport, sportPatch) }]);
      }
    }
    reply.code(201);
    return { test: row };
  });

  app.delete<{ Params: { id: string; testId: string } }>('/athletes/:id/profile/tests/:testId', async (req) => {
    const ctx = await ctxOf(req, req.params.id);
    const testId = validateUuid(req.params.testId, 'test');
    if (!(await ctx.store.deleteTest(testId))) throw new NotFound('Test introuvable');
    return { ok: true };
  });
}

