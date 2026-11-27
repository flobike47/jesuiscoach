# jesuiscoach — consignes pour Claude

App de coaching vélo, mobile first, installable en PWA. Les données Garmin arrivent via **Intervals.icu** (OAuth). Monorepo npm workspaces : `apps/web` (React 19 + Vite + composants iOS maison + TanStack Query) et `apps/bff` (Fastify 5 + Postgres + Redis + client Intervals.icu). Schéma SQL dans `apps/bff/migrations` (appliqué au démarrage du BFF). Tout est hébergé sur le Pi, Postgres compris (sauvegarde quotidienne). Déploiement : images arm64 → Raspberry Pi via Portainer (même Pi qu'investhelper, ports 4100 / 8180). Socle technique repris d'investhelper.

## Posture
Agir en dev senior responsable de la stabilité en prod : cause racine plutôt que symptôme, preuve (test, commande, exécution réelle) avant de dire « c'est fait », pas de changement hors du périmètre demandé, signaler les risques repérés en chemin.

## Skills à charger selon la zone touchée
| Zone | Skill |
|---|---|
| Toute interface (écran, composant, animation, geste) | `apple-design` (+ `mobile-native` pour les correctifs WebKit/iOS) |
| Pages, composants, hooks, appels BFF côté web | `react-frontend` |
| Route API, auth, OAuth, quotas, cache, routes publiques | `bff-endpoint` |
| Appel à Intervals.icu ou autre HTTP sortant | `external-provider` |
| Migrations, requêtes SQL, sauvegardes | `database` |
| Écrire / installer des tests | `testing` |
| Bug signalé | `bugfix` |
| Avant commit / push / PR | `ship-check` |
| CI, Docker, compose, Caddy, variables d'env | `deploy-infra` |

## Commandes
- `npm run db:up` puis `npm run dev` (web :5173, BFF :4000, Postgres :5433, Redis :6380)
- Mode démo sans comptes : `DEMO_MODE=true` dans `apps/bff/.env` (10 cyclistes fictifs, boutons « Démo coach » et « Démo athlète »)
- `npm run check` = typecheck + lint + tests + build (même porte que le CI)

## Garde-fous
- **Un push sur `main` déploie en production.** Jamais sans accord explicite ; travailler sur une branche.
- Aucun secret côté web ni dans le code ; aucun appel réel à Intervals.icu dans les tests (mode démo ou mock).
- Jetons Intervals.icu : chiffrés en base (`TOKEN_ENCRYPTION_KEY`), jamais journalisés, jamais renvoyés au web.
- Quota Intervals.icu OAuth : 100 requêtes/utilisateur/jour → toujours passer par le cache (`sources.ts`).
- Pas de RLS : l'isolation, ce sont les requêtes de `src/db/repo.ts` (filtrées par utilisateur, ou coach → ses athlètes via `assertCanView`). Requêtes paramétrées uniquement.
- Sessions : jeton opaque, seul son SHA-256 est en base ; révoqué à la déconnexion.
- Vocabulaire : « Charge », « Puissance pondérée », « Intensité » (TSS/NP/IF sont des marques TrainingPeaks).
- Code et commentaires en français ; Conventional Commits.
