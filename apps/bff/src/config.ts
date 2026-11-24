import 'dotenv/config';

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/**
 * Adresse publique de l'app web, BASE_PATH compris (ex.
 * https://tondomaine.com/jesuiscoach/), avec « / » final pour résoudre les
 * routes relatives. Par défaut : la première origine CORS, app servie à la
 * racine. Une URL invalide fait échouer le démarrage.
 */
export function resolveAppUrl(appUrl: string | undefined, corsOrigin: string): string {
  const first = corsOrigin.split(',')[0].trim();
  const url = new URL(appUrl ?? (first === '*' ? 'http://localhost:5173' : first));
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin,
  // Lien absolu des notifications push (format déclaratif, voir push.ts)
  appUrl: resolveAppUrl(opt('APP_URL'), corsOrigin),

  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // Postgres (conteneur de la stack, jamais exposé hors du réseau interne)
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://jesuiscoach:jesuiscoach@localhost:5433/jesuiscoach',
  // Durée de vie d'une session de l'app (jeton opaque, révocable).
  sessionDays: 90,

  // Intervals.icu — OAuth (app à demander sur https://intervals.icu/oauth/apply).
  // Optionnel tant que l'app n'est pas validée : sans client_id, la connexion
  // Intervals est désactivée (routes en 503) et seul le mode démo fonctionne.
  intervalsClientId: opt('INTERVALS_CLIENT_ID'),
  intervalsClientSecret: opt('INTERVALS_CLIENT_SECRET'),
  // URL publique du BFF (callback OAuth + webhooks), ex. https://api.tondomaine.com
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  // Clé AES-256-GCM (32 octets en base64) qui chiffre les jetons Intervals en base.
  // Générer : node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  tokenEncryptionKey: opt('TOKEN_ENCRYPTION_KEY'),
  // IDs d'athlètes Intervals.icu (ex. i123456) qui ont le rôle coach, séparés par
  // des virgules. Les autres ne peuvent s'inscrire qu'avec une invitation d'un coach.
  coachAthleteIds: (process.env.COACH_ATHLETE_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),

  // Mode démo : 10 cyclistes fictifs, aucun appel à Intervals.icu. Tout
  // utilisateur connecté est vu comme coach de cette équipe fictive.
  demoMode: process.env.DEMO_MODE === 'true',

  // Notifications Web Push (VAPID) — optionnelles : sans les trois, la
  // fonctionnalité est désactivée (routes en 503, pas de rappel planifié).
  // Générer une paire : npx web-push generate-vapid-keys
  vapidPublicKey: opt('VAPID_PUBLIC_KEY'),
  vapidPrivateKey: opt('VAPID_PRIVATE_KEY'),
  vapidSubject: opt('VAPID_SUBJECT'), // mailto:toi@exemple.com
};
