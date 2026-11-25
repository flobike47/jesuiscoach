# A1 — Fiche profil : identité, physiologie, VMA et tests, envoi vers Intervals.icu

Objectif produit : l'athlète (ou son coach) renseigne et modifie ses données
physiologiques **dans l'app** ; l'app est la source de vérité et pousse les
valeurs vers Intervals.icu (puis la montre). Les données sans équivalent chez
Intervals.icu (VMA, tests) restent dans l'app.

Lis d'abord `CLAUDE.md` et les skills `.claude/skills/{bff-endpoint,database,external-provider,react-frontend,apple-design,testing,ship-check}/SKILL.md`.
Code, commentaires et textes en français. Vocabulaire : « Charge », « Puissance pondérée », « Intensité ».

## Règles de travail (obligatoires)

- Branche : `feat/profil-a1` créée depuis l'état actuel (base commune déjà commitée). Commits Conventional Commits en français, terminés par `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. **Ne pas pousser, ne pas merger.**
- Un autre agent (A2) travaille en parallèle. **Ne touche QUE les fichiers listés ci-dessous.** En particulier ne modifie pas : `apps/web/src/types.ts`, `apps/web/src/services/api.ts`, `apps/web/src/hooks/useCoach.ts`, `apps/web/src/router.tsx`, `apps/web/src/pages/profile/Profile.tsx`, `Availability.tsx`, `Health.tsx`, `apps/bff/src/db/repo.ts`, `apps/bff/src/routes/team.ts`, `apps/bff/src/server.ts` (déjà branché).
- Aucun appel réel à Intervals.icu dans les tests (sources mockées comme dans `apps/bff/test/dashboards.access.test.ts`).
- `npm run check` (racine) doit passer à la fin. Lis sa sortie ; ne dis jamais « fait » sans.

## Fichiers à créer / modifier (A1 uniquement)

BFF :
- `apps/bff/migrations/006_athlete_profile.sql` (nouveau)
- `apps/bff/src/db/profileRepo.ts` (nouveau : toutes les requêtes SQL d'A1)
- `apps/bff/src/lib/profile.ts` (nouveau : validation, bornes, conversions, comparaison Intervals ↔ app — **pur**)
- `apps/bff/src/routes/profile.ts` (remplacer le stub)
- `apps/bff/src/providers/intervals.ts` (3 méthodes d'écriture)
- `apps/bff/src/sources.ts` (étendre `AthleteSource` + `cachedSource`)
- `apps/bff/src/demo.ts` (implémenter les 3 écritures sur les données démo en mémoire)
- `apps/bff/src/routes/intervalsAuth.ts` (scopes OAuth)
- `apps/bff/src/types.ts` (champs ajoutés à `IntervalsAthlete` si besoin : `icu_resting_hr`, `sex`, `height`, `icu_date_of_birth`, et dans `sportSettings[]` : `id`, `lthr`, `max_hr`, `threshold_pace`, `pace_units`)
- Tests : `apps/bff/test/profile.test.ts` (pur) et `apps/bff/test/profile.routes.test.ts` (routes)

Web :
- `apps/web/src/services/profileApi.ts` (nouveau : types + appels, via `api` existant — voir plus bas)
- `apps/web/src/hooks/useProfile.ts` (nouveau : hooks TanStack Query)
- `apps/web/src/lib/physio.ts` + `physio.test.ts` (nouveau : formats, zones calculées — pur)
- `apps/web/src/pages/profile/Identity.tsx` et `Physiology.tsx` (remplacer les stubs, **garder les mêmes exports** : `default`, `IdentityRow`, `PhysiologyRow`, `ProfileSuggestions`, `RowProps`)

Docs : mettre à jour `docs/spike-intervals.md` (section courte « Écriture des réglages ») et `DEPLOY.md` si une variable change (normalement aucune).

## Faits vérifiés sur l'API Intervals.icu (ne pas réinventer)

- `GET /athlete/{id}/sport-settings` → tableau ; chaque élément a `id`, `types` (ex. `["Ride","VirtualRide",…]`, `["Run",…]`, `["Swim","OpenWaterSwim"]`), `ftp`, `lthr`, `max_hr`, `threshold_pace`, `pace_units`, `power_zones` (% FTP), `hr_zones` (bpm).
- **`threshold_pace` est en mètres par seconde.** Exemple réel : natation `0.8333333` avec `pace_units: "SECS_100M"` = 2:00/100 m. Conversions : s/km = 1000 / v ; s/100 m = 100 / v ; v = 1000 / (s/km) = 100 / (s/100m).
- Écriture d'un sport : `PUT /athlete/{id}/sport-settings/{Ride|Run|Swim}?recalcHrZones=true`, corps partiel `{ ftp?, lthr?, max_hr?, threshold_pace? }` (seuls les champs envoyés changent).
- Profil : `PUT /athlete/{id}` corps partiel `{ icu_weight?, icu_resting_hr?, sex?, height?, icu_date_of_birth? }` (`sex` : `"M"`/`"F"`, `height` en cm, date `AAAA-MM-JJ`).
- Forme du jour (historique du poids / FC repos) : `PUT /athlete/{id}/wellness/{AAAA-MM-JJ}` corps `{ weight?, restingHR? }`.
- Scopes OAuth nécessaires : `SETTINGS:WRITE` (réglages, profil), `WELLNESS:WRITE` (wellness). Nouvelle valeur de `OAUTH_SCOPES` : `'ACTIVITY:READ,WELLNESS:WRITE,CALENDAR:WRITE,LIBRARY:READ,SETTINGS:WRITE'`. Le scope accordé est stocké dans `intervals_tokens.scope` (texte). Un compte connecté avant ce changement n'a que `SETTINGS:READ` → l'app enregistre quand même en base mais signale « reconnexion nécessaire » (pas d'appel en écriture).

## Données (migration 006)

```sql
-- Identité et valeurs communes (une ligne par utilisateur)
create table athlete_profile (
  user_id        uuid primary key references users(id) on delete cascade,
  birth_date     date,
  sex            text check (sex in ('M', 'F')),
  height_cm      smallint check (height_cm between 120 and 230),
  weight_kg      numeric(4,1) check (weight_kg between 30 and 200),
  resting_hr     smallint check (resting_hr between 25 and 110),
  vma_kmh        numeric(3,1) check (vma_kmh between 8 and 25),
  updated_at     timestamptz not null default now(),
  updated_by     text not null default 'athlete' check (updated_by in ('athlete', 'coach', 'intervals')),
  synced_at      timestamptz,
  sync_error     text check (length(sync_error) <= 300)
);
-- Valeurs par sport
create table athlete_physiology (
  user_id          uuid not null references users(id) on delete cascade,
  sport            text not null check (sport in ('Ride', 'Run', 'Swim')),
  ftp              smallint check (ftp between 50 and 600),
  lthr             smallint check (lthr between 80 and 220),
  max_hr           smallint check (max_hr between 100 and 230),
  threshold_secs   smallint check (threshold_secs between 60 and 600), -- course : s/km ; natation : s/100 m
  updated_at       timestamptz not null default now(),
  updated_by       text not null default 'athlete' check (updated_by in ('athlete', 'coach', 'intervals')),
  primary key (user_id, sport)
);
-- Tests physiques
create table physio_tests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  day         date not null,
  kind        text not null check (kind in ('ftp', 'lthr', 'vma', 'run_threshold', 'swim_threshold', 'other')),
  value       numeric(6,1) not null,
  note        text check (length(note) <= 300),
  created_at  timestamptz not null default now()
);
create index physio_tests_user_idx on physio_tests (user_id, day desc);
```
Bornes de saisie (BFF et web identiques, dans `lib/profile.ts`) : FTP 50–600 W ; FC seuil 80–220 ; FC max 100–230 ; FC repos 25–110 ; poids 30–200 kg (pas 0,1) ; taille 120–230 cm ; allure seuil course 150–600 s/km (2:30–10:00) ; natation 60–240 s/100 m ; VMA 8–25 km/h (pas 0,1) ; date de naissance entre 1930-01-01 et aujourd'hui − 10 ans. 50 tests au plus par athlète (insertion atomique `insert … select … where (select count(*) …) < 50`, comme `insertSavedWorkout` dans `db/repo.ts`).

## API BFF (routes/profile.ts)

Toutes : `requireUser`, `ATHLETE_ID_RE`, puis `assertCanView(me, athleteId)` (l'athlète lui-même ou son coach ; sinon 404). L'utilisateur cible : `findUserByAthlete(athleteId)` (404 s'il n'existe pas en base, hors démo). `updated_by` = `'coach'` si `me.athleteId !== athleteId`, sinon `'athlete'`.

- `GET /api/athletes/:id/profile` → `{ identity, physiology: { Ride, Run, Swim }, vmaKmh, intervals: { Ride, Run, Swim, weightKg, restingHr }, suggestions[], sync: { syncedAt, error, needsReconnect }, updatedBy, updatedAt }`
  - **Import initial** : si aucune ligne `athlete_profile` n'existe, la créer depuis `source.athlete(id)` (sport settings par sport, `icu_weight`, `icu_resting_hr`, `sex`, `height`), avec `updated_by = 'intervals'`. L'athlète ne retape rien.
  - `intervals` = valeurs actuelles côté Intervals.icu (lues via `source.athlete(id)`, mis en cache 6 h ; le webhook `SPORT_SETTINGS_UPDATED` vide déjà ce cache).
  - `suggestions` = calculées **sans table** par `compareWithIntervals(app, intervals)` dans `lib/profile.ts` : chaque champ où Intervals.icu a une valeur non nulle différente de l'app → `{ sport|null, field, appValue, intervalsValue }`. (Après un envoi réussi les valeurs sont égales, donc plus de suggestion.)
- `PUT /api/athletes/:id/profile/identity` corps `{ birthDate?, sex?, heightCm?, weightKg?, restingHr? }` (null = effacer). Enregistre, puis pousse `PUT /athlete/{id}` (+ `wellness/{aujourd'hui}` pour poids et FC repos). Renvoie le profil complet.
- `PUT /api/athletes/:id/profile/physiology/:sport` (`Ride|Run|Swim`) corps `{ ftp?, lthr?, maxHr?, thresholdSecs? }`. `ftp` refusé (400) hors vélo ; `thresholdSecs` refusé pour le vélo. Enregistre, puis pousse `PUT /sport-settings/{sport}` (convertir `thresholdSecs` → `threshold_pace` m/s). Renvoie le profil.
- `PUT /api/athletes/:id/profile/vma` corps `{ vmaKmh: number|null }` (reste dans l'app).
- `POST /api/athletes/:id/profile/suggestions/accept` corps `{ sport: Ride|Run|Swim|null, field }` → copie la valeur Intervals.icu dans l'app (`updated_by='intervals'`). « Garder » côté web = renvoyer la valeur de l'app via le PUT habituel (qui la repousse vers Intervals.icu).
- Tests physiques : `GET /api/athletes/:id/profile/tests`, `POST` `{ day, kind, value, note?, apply?: boolean }` (si `apply` et kind ∈ ftp/lthr/vma/run_threshold/swim_threshold → met à jour la valeur correspondante et pousse), `DELETE /api/athletes/:id/profile/tests/:testId` (uuid, filtré par user_id).
- **Envoi vers Intervals.icu** : après l'écriture en base. Si le scope stocké ne contient pas `SETTINGS:WRITE` (ou `WELLNESS:WRITE` pour la wellness) → ne pas appeler, `sync.needsReconnect = true`. Erreur provider → enregistrer `sync_error` (message court, sans jeton), renvoyer 200 avec `sync.error` (la sauvegarde dans l'app a réussi). Succès → `synced_at = now()`, `sync_error = null`, et vider `icu:athlete:{id}:*` (`invalidateKeys`).
- Quota : chaque écriture Intervals.icu passe par `enforceQuota(me.id, 'editCalendar')` (déjà défini, 200/jour) — avant l'appel provider.
- **Démo** (`config.demoMode`) : pas de base pour les athlètes démo → stocker identité, physiologie, VMA et tests dans une `Map` en mémoire dans `lib/profile.ts` ou un petit module `src/demoProfile.ts` (nouveau) ; les écritures Intervals.icu passent par `DemoSource` (à implémenter : modifier `info.sportSettings` / `info.icu_weight` en mémoire). Les sportSettings démo n'ont qu'un groupe vélo : ajoute Run (lthr 172, max_hr 191, threshold_pace 1000/280) et Swim (threshold_pace 100/115) dans `demo.ts`.

`AthleteSource` (sources.ts) gagne :
```ts
updateSportSettings(id: string, sport: 'Ride' | 'Run' | 'Swim', patch: { ftp?: number; lthr?: number; max_hr?: number; threshold_pace?: number }): Promise<void>;
updateAthleteProfile(id: string, patch: { icu_weight?: number | null; icu_resting_hr?: number | null; sex?: string | null; height?: number | null; icu_date_of_birth?: string | null }): Promise<void>;
updateWellness(id: string, day: string, patch: { weight?: number; restingHR?: number }): Promise<void>;
```
(`cachedSource` : appelle le client puis `invalidateKeys(\`icu:athlete:${athleteId}:*\`)`.) Mets à jour les sources factices des tests existants qui implémentent `AthleteSource` (`test/sync.test.ts`, `test/webhook.test.ts`) avec des fonctions `unused`/vides.

## Web

- `services/profileApi.ts` : ne modifie pas `services/api.ts`. Il exporte déjà `get`, `post`, `put`, `del` (préfixe `/api` ajouté automatiquement : `get('/athletes/x/profile')`). Types du profil dans `profileApi.ts`.
- `hooks/useProfile.ts` : `useProfile(athleteId)`, `useSaveIdentity`, `useSavePhysiology`, `useSaveVma`, `useAcceptSuggestion`, `useTests`, `useAddTest`, `useDeleteTest` ; invalider `['profile', athleteId]` (et `['athlete', athleteId]`, `['power', athleteId]`, `['zones', athleteId]` après un changement de physiologie).
- `lib/physio.ts` (pur, testé) : `formatPace(secs, 'Run'|'Swim')` → « 4:35 /km », « 1:55 /100 m » ; zones de puissance calculées depuis la FTP (% Coggan : 55, 75, 90, 105, 120, 150) et cardio depuis la FC seuil (% Friel : 81, 90, 94, 100, 103) ; âge depuis la date de naissance.
- **Sélecteurs** : utiliser **uniquement** `components/common/NumberStepper.tsx` (déjà fait : boutons − / + et saisie directe ; `kind="clock"` pour les allures). Pas de nouveau composant de saisie numérique.
- `Physiology.tsx` (maquette validée) : `Segmented` Vélo / Course / Natation ; vélo : FTP, FC seuil, FC max ; course : allure seuil (clock, /km), FC seuil, FC max ; natation : allure seuil (clock, /100 m) ; section « Commun à tous les sports » : FC de repos, poids (ces deux-là s'enregistrent via la route identity) ; aperçu des zones calculées (`ZoneBar` existe : `components/common/ZoneBar.tsx`) ; section « VMA et tests » : VMA (NumberStepper pas 0,1), liste des tests, ajout dans une `Sheet` (date, type, valeur, note, case « Mettre à jour mon profil avec ce résultat »), suppression. Bouton « Enregistrer » (désactivé si rien n'a changé) ; pied : « Envoyé à Intervals.icu, puis à ta montre. » ; afficher l'état de synchro (✓ heure, erreur, ou « Reconnecte ton compte Intervals.icu pour envoyer ces valeurs » avec un bouton qui appelle `useAuth().signInWithIntervals()`).
- Si la dernière modification vient du coach et que l'utilisateur consulte sa propre fiche → bandeau discret « Modifié par ton coach le … ».
- `Identity.tsx` : date de naissance (`<input type="date">`), sexe (`Segmented` Homme / Femme / Non précisé), taille et poids (`NumberStepper`), FC de repos. Même logique d'enregistrement / synchro.
- `ProfileSuggestions` : bandeau orange en tête de la fiche quand `suggestions.length > 0`, une ligne par suggestion (« Intervals.icu propose une FTP de 262 W »), boutons « Accepter » / « Garder 245 W ».
- `IdentityRow` / `PhysiologyRow` : `Cell` avec un résumé (`32 ans · 70 kg` ; `FTP 245 W · FC seuil 172`) lu via `useProfile(athleteId)`.
- Design : skill `apple-design` ; composants `@/components/ios` (`Page`, `Section`, `Cell`, `Segmented`, `Sheet`, `Placeholder`) ; zones de toucher ≥ 44 px ; clair et sombre (variables CSS existantes).

## Politique de confidentialité
Ne la modifie pas (A2 s'en charge pour la santé et la date de naissance) ; signale dans ton rapport les traitements ajoutés.

## Tests attendus (Vitest)
- `lib/profile.ts` : conversions m/s ↔ s/km et s/100 m (aller-retour), bornes, `compareWithIntervals`.
- Routes (`app.inject`, `setupTestDb`/`resetDb`, sources mockées) : 401 sans session ; 404 pour un athlète hors équipe (coach A sans lien avec B, puis 200 après `linkCoachAthlete`) ; import initial depuis Intervals ; PUT physiology → valeur en base + appel `updateSportSettings('iB','Run',{ threshold_pace: 1000/275 })` ; `ftp` sur la course → 400 ; scope sans `SETTINGS:WRITE` → enregistré, `needsReconnect: true`, aucun appel provider ; erreur provider → 200 avec `sync.error` ; `updated_by` = `coach` quand le coach modifie ; suggestions puis accept ; tests physiques avec `apply` ; limite de 50 tests.
- Web : `lib/physio.test.ts`.
- Scope OAuth : adapter le test existant qui vérifie l'URL d'autorisation (`test/intervalsAuth.routes.test.ts`) si besoin.

## Vérification finale
1. `npm run check` à la racine : tout vert (copie les lignes « Tests … passed » dans ton rapport).
2. Pas de vérification navigateur demandée (l'orchestrateur la fera).

## Rapport final (français, court)
Branche et commits ; ce qui est fait ; écarts au plan et pourquoi ; sortie de `npm run check` ; ce qui n'est pas vérifié ; liste exacte des fichiers modifiés hors liste (doit être vide).
