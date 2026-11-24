---
name: database
description: Modifier le schéma ou les requêtes Postgres de jesuiscoach (apps/bff/migrations/*.sql, apps/bff/src/db/*). À utiliser pour toute nouvelle table/colonne/index/contrainte, requête SQL côté BFF, migration, sauvegarde ou restauration.
---

# Base de données (Postgres 16 sur le Raspberry Pi)

## Modèle de sécurité
- Seul le BFF parle à Postgres ; le conteneur n'est exposé que sur le réseau interne de la stack. Il n'y a pas de RLS : **la barrière d'isolation, ce sont les requêtes de `src/db/repo.ts`**.
- Chaque requête liée à un utilisateur filtre sur son id (`where user_id = $1`) ou passe par le lien coach → athlète (`coach_athletes`). Côté routes, l'accès à un athlète passe par `assertCanView`.
- **Requêtes paramétrées uniquement** (`$1, $2…`). Jamais de concaténation, même pour un nom de colonne (allowlist si besoin).
- Toutes les requêtes vivent dans `src/db/repo.ts` (une fonction par besoin) : pas de SQL dans les routes.

## Migrations
- `apps/bff/migrations/NNN_description.sql`, appliquées **au démarrage du BFF** par `src/db/migrate.ts` (table `schema_migrations`, une transaction par fichier). Copiées dans l'image par le Dockerfile.
- **Jamais modifier une migration déjà déployée** : en ajouter une nouvelle.
- Rétrocompatibles (expand → déployer → contract) : une colonne `not null` sans `default` casse l'ancienne version pendant le redéploiement.
- Contraintes dans la base : `check` (longueurs, enums), `not null`, FK `on delete cascade`, `unique`. Le BFF valide pour l'UX, la base garantit l'invariant.
- Index sur toute colonne filtrée ou triée fréquemment.

## Requêtes
- Colonnes explicites, jamais `select *` vers une réponse API.
- **Atomicité** : pas de « lire puis écrire » en deux requêtes. Une seule instruction (`insert … on conflict`, `update … where … returning`, comme `consumeInvitation`) ou une transaction (`db().transaction`).
- Codes Postgres → HTTP : `23505` unique → 409, `23503` FK → 404/400, `23514` check → 400, `22P02` format invalide → 400.
- Dates : `timestamptz` partout ; passer des `Date.toISOString()` en paramètre.

## Tests
`test/helpers.ts` monte un **vrai Postgres en mémoire (PGlite)** et joue les vraies migrations : contraintes, cascades et filtres d'isolation sont testés pour de bon. Pour chaque nouvelle requête : cas nominal, isolation (l'utilisateur B ne voit/modifie pas les lignes de A), contrainte violée.

## Exploitation (Pi)
- Sauvegarde : service `postgres-backup` de `docker-compose.prod.yml` (`pg_dump` quotidien, 14 jours, dans `BACKUP_DIR`). Vérifier les logs du service après chaque modification.
- Restauration : voir `DEPLOY.md` (« Restaurer une sauvegarde »). La tester au moins une fois.
- Données sur SSD, pas sur carte SD.
