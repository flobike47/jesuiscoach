# C — Calendrier dans l'app : séances, compétitions, objectifs

Objectif produit : le calendrier de chaque athlète est **stocké dans l'app** (source de vérité).
Chaque séance / compétition créée ou modifiée dans l'app est **recopiée vers Intervals.icu**
(qui la pousse vers la montre). Les événements créés directement dans Intervals.icu sont
**importés** à la lecture, pour que l'app voie tout. S'ajoutent les P0 de la note produit :
compétitions A/B/C, objectifs intermédiaires, **modifier le contenu** d'une séance déjà
envoyée, et la **vue « Aujourd'hui » du coach** (toute l'équipe).

Lis d'abord `CLAUDE.md` et les skills `.claude/skills/{bff-endpoint,database,external-provider,react-frontend,apple-design,testing,ship-check}/SKILL.md`.
Code, commentaires et textes en français. Vocabulaire : « Charge », « Puissance pondérée », « Intensité ».

## Règles de travail (obligatoires)

- Branche `feat/calendrier-c` depuis l'état actuel (base commune commitée). Commits Conventional Commits en français terminés par `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. **Ne pas pousser, ne pas merger.**
- Un autre agent (D : copie des sorties et calculs) travaille en parallèle. **Ne touche QUE les fichiers listés.** Interdits notamment : `apps/bff/src/routes/team.ts`, `routes/dashboards.ts`, `jobs/sync.ts`, `jobs/webhook.ts`, `lib/summary.ts`, `lib/dashboards.ts`, `sources.ts`, `providers/*`, `demo.ts`, `types.ts` (BFF), `db/repo.ts`, `server.ts`, `apps/web/src/types.ts`, `services/api.ts`, `hooks/useCoach.ts`, `router.tsx`, `pages/profile/Profile.tsx`, `pages/Privacy.tsx`.
- Aucun appel réel à Intervals.icu (sources mockées dans les tests). Ne lis jamais `.env`.
- `npm run check` (racine) vert à la fin, sortie lue.

## Déjà fourni par la base commune (à utiliser, ne pas recréer)

- `AthleteSource` (sources.ts) : `events(id, from, to)`, `createEvent(id, { category: 'WORKOUT'|'RACE_A'|'RACE_B'|'RACE_C'|'NOTE', date, name, description?, sport? })` → événement Intervals avec `id`, `updateEvent(id, eventId, { date?, name?, description?, sport?, category? })` (partiel), `deleteEvent(id, eventId)`, `createWorkout` (ancien, à ne plus utiliser), `activities(...)`. Démo implémentée.
- `routes/calendar.ts` (déjà extrait de team.ts) contient : `GET /athletes/:id/calendar`, `PUT|DELETE /athletes/:id/events/:eventId`, `POST /workouts` (avec contrôles A2 : blessures / `force`). **C'est ton fichier principal.**
- Pages réservées (remplacer, garder les exports) : `apps/web/src/pages/TeamToday.tsx` (route `/aujourdhui`), `apps/web/src/pages/profile/Goals.tsx` (routes `/profil/objectifs` et `/athletes/:id/profil/objectifs`, exports `default`, `GoalsRow`, `RowProps`).
- `services/api.ts` exporte `get`, `post`, `put`, `del` (préfixe `/api` auto).

## Fichiers autorisés

BFF : `migrations/008_calendar.sql` (nouveau), `src/db/calendarRepo.ts` (nouveau), `src/lib/calendar.ts` (nouveau, pur), `src/calendarService.ts` (nouveau : écriture base + recopie Intervals + import), `src/demoCalendar.ts` (nouveau si utile), `src/routes/calendar.ts`, `src/routes/planning.ts` (seulement l'application d'un plan → passer par le service), tests `test/calendar*.test.ts` (nouveaux) ; adapter les tests existants qui appellent ces routes (`test/team.routes.test.ts`, `test/planning.test.ts`, `test/care.routes.test.ts`) **uniquement** si leur comportement attendu change.
Web : `services/calendarApi.ts`, `hooks/useCalendarData.ts` (nouveaux), `lib/calendar.ts` + test (nouveau, pur), `pages/Calendar.tsx`, `pages/TeamToday.tsx`, `pages/Team.tsx` (seulement un lien « Aujourd'hui » en tête), `pages/profile/Goals.tsx`, `pages/Workouts.tsx` (seulement l'appel d'envoi si sa réponse change), `components/workout/PlanSheet.tsx` (idem).

## Données (migration 008)

```sql
create table calendar_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,   -- l'athlète
  kind               text not null check (kind in ('workout', 'race', 'note')),
  sport              text check (sport in ('Ride', 'Run', 'Swim')),
  day                date not null,
  name               text not null check (length(name) between 1 and 120),
  description        text check (length(description) <= 4000),
  race_priority      text check (race_priority in ('A', 'B', 'C')),         -- kind = race
  race_distance_m    integer check (race_distance_m between 100 and 1000000),
  race_goal          text check (length(race_goal) <= 200),                 -- ex. « finir en 4 h 30 »
  origin             text not null default 'app' check (origin in ('app', 'intervals')),
  intervals_id       text check (length(intervals_id) <= 40),               -- id de l'événement chez Intervals.icu
  sync_status        text not null default 'pending' check (sync_status in ('pending', 'synced', 'error')),
  sync_error         text check (length(sync_error) <= 300),
  created_by         text not null default 'coach' check (created_by in ('athlete', 'coach', 'intervals')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (kind <> 'race' or race_priority is not null)
);
create unique index calendar_events_intervals_idx on calendar_events (user_id, intervals_id) where intervals_id is not null;
create index calendar_events_day_idx on calendar_events (user_id, day);

create table goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  title         text not null check (length(title) between 1 and 120),
  metric        text check (metric in ('ftp', 'weight', 'run_threshold', 'swim_threshold', 'vma', 'weekly_hours', 'other')),
  target_value  numeric(7,1),
  due_day       date,
  race_id       uuid references calendar_events(id) on delete set null,
  achieved_on   date,
  note          text check (length(note) <= 500),
  created_by    text not null default 'coach' check (created_by in ('athlete', 'coach')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index goals_user_idx on goals (user_id, due_day);
```
Limites : 500 événements futurs par athlète, 30 objectifs (insertion atomique comme `insertSavedWorkout` dans `db/repo.ts`). Catégorie Intervals d'une compétition = `RACE_` + priorité.

## Règles de synchronisation (calendarService.ts)

- **Écrire** (créer / modifier / déplacer / supprimer) : d'abord en base (`sync_status='pending'`), puis l'appel Intervals.icu (`createEvent` / `updateEvent` / `deleteEvent`). Succès → `synced` + `intervals_id`. Échec → `error` + message court (sans jeton) ; la réponse HTTP reste 200 avec le statut (la donnée de l'app est enregistrée). Quota : `enforceQuota(me.id, 'editCalendar')` (ou `assignWorkout` pour les envois groupés, comme aujourd'hui) **avant** chaque appel Intervals.
- **Supprimer** : supprimer chez Intervals.icu si `intervals_id`, puis la ligne en base (même si Intervals répond 404).
- **Importer** (à chaque lecture d'une plage, `GET /athletes/:id/calendar`) : lire `events(id, from, to)` (cache 10 min, vidé par le webhook `CALENDAR_UPDATED`) ; pour chaque événement Intervals de catégorie WORKOUT / RACE_A/B/C / NOTE **sans** ligne correspondante (`intervals_id`) → insérer avec `origin='intervals'`, `created_by='intervals'`, `sync_status='synced'`. Pour les lignes `origin='intervals'` de la plage **absentes** chez Intervals → les supprimer (supprimées là-bas). Pour une ligne `origin='app'`, `synced`, absente chez Intervals → `sync_status='error'`, `sync_error='Supprimée dans Intervals.icu'` (le web propose « Renvoyer »). Les autres catégories (HOLIDAY, SICK…) sont ignorées.
- **Renvoyer** : `POST /athletes/:id/events/:eventId/resync` → recrée ou met à jour chez Intervals.icu.
- Les événements renvoyés au web gardent **la forme actuelle** (`events: [{ id, category, type, start_date_local, name, description }]`) **plus** des champs ajoutés : `appId` (uuid), `kind`, `racePriority`, `raceDistanceM`, `raceGoal`, `origin`, `syncStatus`, `syncError`. `id` = `intervals_id` s'il existe, sinon l'uuid (les routes `:eventId` acceptent les deux : uuid → ligne app ; sinon → recherche par `intervals_id`). Garder `activities` et `doneEventIds` (appariement `matchPlan` inchangé).
- **Démo** (`config.demoMode`, pas de base pour les athlètes démo) : un magasin en mémoire (`demoCalendar.ts`) qui suit les mêmes règles, avec `DemoSource` comme « Intervals.icu ». Ajoute 1 compétition A dans 6 semaines et 2 objectifs pour `demo-1`.

## API BFF (routes/calendar.ts)

Accès : `requireUser`, `ATHLETE_ID_RE`, `assertCanView` (athlète lui-même ou son coach, sinon 404) ; `created_by` = `'coach'` si `me.athleteId !== id`.
- `GET /athletes/:id/calendar?from&to` (≤ 62 jours) : import + lecture base, forme décrite ci-dessus.
- `POST /athletes/:id/events` corps `{ kind: 'workout'|'race'|'note', date, name, description?, sport?, racePriority?, raceDistanceM?, raceGoal? }` (workout : sport requis ; race : priorité requise).
- `PUT /athletes/:id/events/:eventId` corps **partiel** `{ date?, name?, description?, sport?, racePriority?, raceDistanceM?, raceGoal? }` — remplace l'ancien PUT `{ date }` (toujours accepté).
- `DELETE /athletes/:id/events/:eventId`, `POST …/resync`.
- `POST /workouts` (envoi groupé, garder les contrôles A2 et `force`) : chaque athlète passe par `calendarService.create` (kind workout) → résultat par athlète `{ id, ok, eventId?, syncStatus, error?, blocked? }`.
- Application d'un plan (`routes/planning.ts`, `POST /plans/:id/apply`) : remplacer `src.createWorkout` par `calendarService.create` (une ligne par séance ; garder quota, bornes et échecs partiels).
- Objectifs : `GET /athletes/:id/goals` → `{ races: [prochaines compétitions, triées], goals: [...] }` ; `POST /athletes/:id/goals`, `PUT …/goals/:goalId`, `DELETE …/goals/:goalId` (filtrés par `user_id`).
- Journée du coach : `GET /team/today?date=AAAA-MM-JJ` (coach seulement, 403 sinon ; date par défaut = aujourd'hui à Paris via `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })`) → `{ date, athletes: [{ id, name, planned: [événements du jour], done: [sorties du jour : id, name, type, moving_time, icu_training_load], status: 'done'|'planned'|'missed'|'rest'|'extra' }] }` (`missed` = prévu, rien de fait, jour passé ; `extra` = sortie sans séance prévue). Une source en échec → l'athlète apparaît avec `error`.

## Web

- `Calendar.tsx` : garder l'existant (semaine, athlète, jours grisés A2). Ajouter : icône drapeau + priorité pour les compétitions ; badge « Non synchronisé » + bouton « Renvoyer » quand `syncStatus === 'error'` ; ouvrir une séance prévue (non faite) dans une `Sheet` qui permet de **modifier nom, sport et structure** (réutiliser `StructureEditor` et `WorkoutSummary` de `components/workout/StructureEditor.tsx`) et la date (le déplacement existant) ; bouton « Ajouter » → séance vide ou compétition.
- `TeamToday.tsx` : liste de l'équipe pour la date (sélecteur de jour ‹ › autour d'aujourd'hui) ; chaque ligne : avatar (`Avatar` de `@/components/ios`), nom, statut coloré (fait vert, prévu bleu, manqué rouge, repos gris, hors plan violet), séance prévue et sortie faite (durée, charge) ; toucher → `/athletes/:id`. `Team.tsx` : un lien « Aujourd'hui » en tête de page.
- `Goals.tsx` : « Prochaines compétitions » (nom, date, priorité A/B/C, distance, objectif, J-n) ; « Objectifs » (titre, métrique et valeur cible, échéance, atteint ✓) ; ajout / modification / suppression dans des `Sheet` ; `NumberStepper` (`components/common/NumberStepper.tsx`) pour les valeurs. `GoalsRow` : résumé « Marmotte dans 42 j · 2 objectifs ».
- Design : skill `apple-design`, composants `@/components/ios`, clair / sombre, cibles ≥ 44 px.

## Tests attendus
- `lib/calendar.ts` (pur) : réconciliation import (nouveaux, disparus côté Intervals, app non synchronisée), statut de la journée (done/planned/missed/rest/extra), validations.
- Routes : 401 ; 404 hors équipe ; création → ligne + appel `createEvent` + `intervals_id` ; échec provider → 200 `syncStatus: 'error'` puis `resync` ; PUT partiel → `updateEvent` avec seulement les champs changés ; DELETE → `deleteEvent` + ligne supprimée ; import d'un événement créé chez Intervals ; compétition → catégorie `RACE_A` ; `POST /workouts` → lignes créées, blocage A2 conservé ; application d'un plan → lignes créées ; `/team/today` statuts et 403 pour un athlète ; objectifs CRUD + isolation (id d'un autre athlète → 404).
- Web : `lib/calendar.test.ts`.

## Rapport final (français, court)
Commits ; fait ; écarts au plan et pourquoi ; lignes « Tests … passed » de `npm run check` ; non vérifié ; fichiers touchés hors liste (doit être vide).
