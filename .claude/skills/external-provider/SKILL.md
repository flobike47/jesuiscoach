---
name: external-provider
description: Intégrer ou modifier un fournisseur externe du BFF (Intervals.icu) dans apps/bff/src/providers/*. À utiliser pour tout appel HTTP sortant, chaîne de fallback, gestion de timeout/retry/429, ou ajout d'une nouvelle source de données.
---

# Fournisseurs externes — résilience et exactitude

Intervals.icu limite à 100 requêtes/utilisateur/jour en OAuth, 2 500 / 15 min en clé API et 10 appels/s par IP (réponses 429 + `Retry-After`) ; Cloudflare devant Intervals bloque certains user-agents (`providers/intervals.ts` en envoie un explicite). Le BFF tourne sur un Raspberry Pi : une requête pendue coûte une socket et un slot du pool keep-alive (`maxSockets: 20`).

## Règles non négociables

1. **Timeout explicite partout.** `timeout: 0` (= infini) est interdit. `createProviderClient(baseURL, provider, timeoutMs)` applique `DEFAULT_TIMEOUT_MS` (10 s) ; un appel `axios` direct doit passer `timeout: DEFAULT_TIMEOUT_MS`. Valeur de référence : 10 s (Intervals.icu). Passer un `AbortSignal` (`AbortSignal.timeout(ms)`) quand l'appel est déclenché par une requête client, pour annuler si le client part.
2. **Clés API hors URL.** Une clé en query string (`?token=`, `?key=`) finit dans les logs d'erreur axios, les proxies et les traces. Utiliser l'en-tête quand le provider le permet (Intervals.icu : `Authorization: Bearer` en OAuth, Basic `API_KEY:<clé>` en clé perso). Les jetons OAuth des athlètes sont chiffrés en base (`lib/crypto.ts`) et ne sont jamais journalisés.
3. **Valider la réponse.** Un provider peut renvoyer 200 avec `{ error: ... }`, un tableau vide, `s: 'no_data'`, ou des `null`/`0` à la place de valeurs. Parser avec un schéma (Zod) à la frontière et normaliser vers les types internes (`types.ts`). Un prix à `0` n'est pas un prix.
4. **Erreurs typées.** Toujours `ProviderError(message, status, provider)`. Mapper le statut amont vers un statut BFF sensé : amont 5xx/timeout → 502/504, amont 429 → 503 + `Retry-After`, clé manquante → 503. Ne jamais propager un 401 amont comme un 401 BFF (le front croirait que la session est expirée).
5. **Retry seulement si idempotent et transitoire** (timeout, ECONNRESET, 502/503/504, 429 avec `Retry-After`) : max 2 retries, backoff exponentiel + jitter. Jamais de retry sur 4xx métier ni sur un appel facturé non idempotent (génération LLM) sans le vouloir explicitement.
6. **Jeton expiré ou révoqué** (401/403 d'Intervals.icu, pas de refresh token) : ne pas réessayer en boucle ; remonter « reconnexion nécessaire » pour cet athlète sans bloquer le reste de l'équipe (`Promise.allSettled`).
7. **Respect des rate-limits.** Concurrence bornée par provider (un athlète = un quota OAuth : grouper les lectures, lire d'abord le cache) + cooldown partagé dans Redis après 429. Pour un nouveau provider, documenter sa limite (ex. Intervals.icu OAuth = 100 req/utilisateur/jour) en tête de fichier.
8. **État module-level** (compteurs, sources démo) : penser au fait qu'il est par process et perdu au redémarrage ; tout ce qui doit survivre ou être partagé va dans Redis.

## Ajouter un provider — étapes
1. Créer `providers/<name>.ts` via `createProviderClient(baseURL, '<Name>')`.
2. Clé dans `config.ts` via `opt()` (provider optionnel) ou `req()` (obligatoire) + `.env.example` + `docker-compose.prod.yml` + `.env.prod.example`.
3. Types de réponse + schéma de validation ; fonctions exportées qui renvoient des types internes, jamais la forme brute du provider.
4. Cache dans la route (pas dans le provider) avec un TTL de `cache.ts`.
5. Tests : réponses enregistrées (fixtures JSON) rejouées via `nock`/`msw` — nominal, vide, 429, 500, timeout, JSON malformé.

## Dates et fuseaux
Intervals.icu renvoie des dates **locales à l'athlète** (`start_date_local`, sans fuseau) et attend `start_date_local` en `AAAA-MM-JJT00:00:00` pour un événement. `toISOString().slice(0,10)` donne la date **UTC** : correct pour une clé de cache, faux pour « la sortie d'aujourd'hui » vers minuit. Durées Intervals en secondes, JS en millisecondes — toujours nommer l'unité (`tSec`, `tMs`).

## Vérification
Tester le provider réellement une fois en local (`npm run dev:bff` + `curl`) puis couper le réseau / mettre une mauvaise clé pour vérifier que le BFF renvoie une erreur propre et rapide, sans pendre.
