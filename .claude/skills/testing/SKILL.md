---
name: testing
description: Écrire, organiser ou mettre en place les tests de jesuiscoach (Vitest pour web et BFF, fastify.inject pour les routes, Testing Library pour React, mocks réseau). À utiliser quand on ajoute une fonctionnalité, corrige un bug, ou quand l'outillage de test n'existe pas encore.
---

# Tests — stratégie et outillage

## En place
- BFF : `apps/bff/test/*.test.ts`. `test/helpers.ts` monte un **vrai Postgres en mémoire (PGlite)** avec les vraies migrations (`setupTestDb`, `resetDb`, `rows`), deux utilisateurs (A coach, B athlète) et leurs sessions de test (`auth('token-a')`) : un oubli de filtre fait échouer les tests d'isolation. Redis : `vi.mock('ioredis', …)` vers `ioredis-mock` (voir `team.routes.test.ts`). Intervals.icu : jamais appelé en test — `DEMO_MODE=true` ou `vi.mock('../src/providers/intervals.js')` (voir `intervalsAuth.routes.test.ts`).
- Web : tests à côté du code (`src/**/*.test.ts`), jsdom par défaut ; `// @vitest-environment node` pour un module sans DOM.
- `npm test` (racine) lance tout ; les tests BFF sont typecheckés par `npm run typecheck`.

## Référence de mise en place
- Racine : script `"test": "npm run test --workspaces --if-present"`.
- `apps/bff` : `vitest` ; script `"test": "vitest run"`, `"test:watch": "vitest"`. Config `vitest.config.ts` avec `environment: 'node'`.
  - Pour tester les routes sans démarrer le serveur : `buildServer()` + `app.inject()`. Les variables de test sont dans `test.env` de la config Vitest (prioritaires sur un `apps/bff/.env` local).
  - Redis : `ioredis-mock` via `vi.mock('../src/cache.js')` ou un Redis réel en service CI. Postgres : PGlite via `setupTestDb()` dans `beforeAll` (pas de mock de la base).
  - HTTP sortant : `nock` ou `msw/node` avec fixtures JSON dans `test/fixtures/<provider>/`. `nock.disableNetConnect()` : aucun test ne doit toucher Internet ni une API payante.
- `apps/web` : `vitest` + `jsdom` + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`. Réutiliser `vite.config.ts` (alias `@/`). `msw` pour simuler le BFF.
- Couverture : `@vitest/coverage-v8`. Viser des seuils sur `lib/` et `apps/bff/src` (≥ 80 % lignes), pas un chiffre global vanité.

## Quoi tester, par priorité
1. **Logique pure à fort impact** : `apps/bff/src/lib/summary.ts` (alertes, conformité), `lib/crypto.ts`, `apps/web/src/lib/workout.ts` (format des séances, charge estimée), `bff/validation.ts`. Rapide, déterministe, rentable.
2. **Routes BFF** (`app.inject`) : nominal, 401, 400, isolation entre users, 404 ressource d'un autre user, 429 quota, provider en panne → erreur propre, Redis down → passthrough.
3. **Hooks/composants** critiques : mutations optimistes (rollback sur erreur), états chargement/erreur/vide, `RequireAuth`.
4. **E2E** (Playwright) sur 2-3 parcours seulement une fois le reste en place : mode démo → équipe → fiche athlète → envoi d'une séance.

## Règles d'écriture
- Un test = un comportement, nommé en français par le comportement attendu (`'renvoie 404 quand l'épisode appartient à un autre user'`).
- Arrange / Act / Assert visibles. Pas de logique (boucles, if) dans le corps d'un test : `it.each` pour les tables.
- Tester le comportement observable (réponse HTTP, DOM rendu, valeur retournée), pas les détails d'implémentation.
- Testing Library : requêtes par rôle/label (`getByRole('button', { name: /écouter/i })`), jamais par classe CSS.
- Temps : `vi.useFakeTimers()` + `vi.setSystemTime()` pour tout ce qui dépend de la date (clés de cache journalières, expiration de partage).
- Aléatoire : injecter ou mocker (`crypto.randomBytes`) pour rendre déterministe.
- Pas de `sleep` / timeouts arbitraires ; `await findBy*` / `vi.waitFor`.
- Chaque bug corrigé ⇒ un test de régression qui échoue **avant** le fix (voir skill `bugfix`).

## Vérification
Un test qui n'a jamais échoué n'a rien prouvé : pour un nouveau test, casser temporairement le code ciblé et vérifier qu'il échoue, puis restaurer.
