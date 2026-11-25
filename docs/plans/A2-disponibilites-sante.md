# A2 — Fiche profil : disponibilités, matériel, santé, et avertissements côté coach

Objectif produit : l'athlète renseigne **dans l'app** sa semaine type (jours, temps
max, créneau, lieu), un volume visé, ses exceptions (vacances), son matériel et ses
blessures / limitations. Ces données **restent dans l'app** (rien n'est envoyé à
Intervals.icu). Le coach en profite : jours indisponibles grisés au calendrier, et
avertissements au moment d'envoyer une séance.

Décisions validées par l'utilisateur :
1. Le coach peut modifier ces données (comme l'athlète) ; on garde qui a modifié.
2. Une **blessure en cours bloque** l'envoi d'une séance du sport concerné, avec un bouton « Envoyer quand même ».
3. Une séance **plus longue que le temps disponible** ce jour-là → **simple avertissement** avec un jour disponible proposé (pas de déplacement automatique).

Lis d'abord `CLAUDE.md` et les skills `.claude/skills/{bff-endpoint,database,react-frontend,apple-design,testing,ship-check}/SKILL.md`.
Code, commentaires et textes en français.

## Règles de travail (obligatoires)

- Branche : `feat/profil-a2` créée depuis l'état actuel (base commune déjà commitée). Commits Conventional Commits en français, terminés par `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. **Ne pas pousser, ne pas merger.**
- Un autre agent (A1) travaille en parallèle sur l'identité et la physiologie. **Ne touche QUE les fichiers listés ci-dessous.** En particulier ne modifie pas : `apps/web/src/types.ts`, `apps/web/src/services/api.ts`, `apps/web/src/hooks/useCoach.ts`, `apps/web/src/router.tsx`, `apps/web/src/pages/profile/Profile.tsx`, `Identity.tsx`, `Physiology.tsx`, `apps/bff/src/db/repo.ts`, `apps/bff/src/sources.ts`, `apps/bff/src/demo.ts`, `apps/bff/src/providers/*`, `apps/bff/src/types.ts`, `apps/bff/src/server.ts` (déjà branché).
- `npm run check` (racine) doit passer à la fin. Lis sa sortie ; ne dis jamais « fait » sans.

## Fichiers à créer / modifier (A2 uniquement)

BFF :
- `apps/bff/migrations/007_availability_health.sql` (nouveau)
- `apps/bff/src/db/careRepo.ts` (nouveau : toutes les requêtes SQL d'A2, paramétrées, filtrées par `user_id`)
- `apps/bff/src/lib/care.ts` (nouveau, **pur** : validation, et `checkWorkout` qui calcule les avertissements)
- `apps/bff/src/routes/care.ts` (remplacer le stub)
- `apps/bff/src/routes/team.ts` : **uniquement** la route `POST /workouts` (blocage blessure + `force`)
- Tests : `apps/bff/test/care.test.ts` (pur) et `apps/bff/test/care.routes.test.ts`

Web :
- `apps/web/src/services/careApi.ts` (nouveau ; `services/api.ts` exporte déjà `get`, `post`, `put`, `del`, préfixe `/api` automatique)
- `apps/web/src/hooks/useCare.ts` (nouveau)
- `apps/web/src/lib/availability.ts` + `.test.ts` (nouveau, pur : résumés, jour disponible le plus proche côté affichage)
- `apps/web/src/pages/profile/Availability.tsx`, `Health.tsx` (remplacer les stubs, **garder les mêmes exports** : `default`, `AvailabilityRow` ; `default`, `EquipmentRow`, `HealthRow` ; `RowProps`)
- `apps/web/src/pages/Workouts.tsx` (avertissements dans la feuille de séance)
- `apps/web/src/pages/Calendar.tsx` (jours indisponibles grisés)
- `apps/web/src/pages/Privacy.tsx` (santé, date de naissance — voir plus bas)

## Données (migration 007)

```sql
-- Semaine type : une ligne par jour (0 = lundi … 6 = dimanche)
create table athlete_availability (
  user_id      uuid not null references users(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  available    boolean not null default true,
  max_minutes  smallint check (max_minutes between 10 and 720),
  slot         text not null default 'any' check (slot in ('any', 'morning', 'noon', 'evening')),
  place        text not null default 'any' check (place in ('any', 'outdoor', 'indoor')),
  primary key (user_id, weekday)
);
-- Réglages généraux de la fiche « soin » (volume visé, matériel, qui a modifié)
create table athlete_care (
  user_id          uuid primary key references users(id) on delete cascade,
  weekly_minutes   smallint check (weekly_minutes between 0 and 3000),
  power_meter      boolean not null default false,
  hr_strap         boolean not null default false,
  smart_trainer    boolean not null default false,
  pool_access      boolean not null default false,
  updated_at       timestamptz not null default now(),
  updated_by       text not null default 'athlete' check (updated_by in ('athlete', 'coach'))
);
-- Exceptions (vacances, déplacement) : indisponible du … au …
create table availability_exceptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  from_day    date not null,
  to_day      date not null check (to_day >= from_day),
  note        text check (length(note) <= 200),
  created_at  timestamptz not null default now()
);
create index availability_exceptions_user_idx on availability_exceptions (user_id, from_day);
-- Blessures et limitations (données de santé : athlète et son coach seulement)
create table injuries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  title            text not null check (length(title) between 1 and 120),
  started_on       date not null,
  expected_end     date,
  ended_on         date,
  avoid_sports     text[] not null default '{}' check (avoid_sports <@ array['Ride','Run','Swim']::text[]),
  avoid_intensity  boolean not null default false, -- pas d'effort au-dessus du seuil
  note             text check (length(note) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index injuries_user_idx on injuries (user_id, started_on desc);
```
Limites : 30 exceptions et 30 blessures au plus par athlète (insertion atomique `insert … select … where (select count(*) …) < N`, voir `insertSavedWorkout` dans `db/repo.ts`).

Une blessure est **en cours** à une date `d` si `started_on <= d` et `(ended_on is null or ended_on >= d)` et `(expected_end is null or expected_end >= d)`.

## API BFF (routes/care.ts)

Toutes : `requireUser`, `ATHLETE_ID_RE` (`validation.ts`), `assertCanView(me, athleteId)` (lui-même ou son coach ; sinon 404), `findUserByAthlete(athleteId)` pour l'id utilisateur. `updated_by` = `'coach'` si `me.athleteId !== athleteId`.

- `GET /api/athletes/:id/care` → `{ weeklyMinutes, days: [7 × { weekday, available, maxMinutes, slot, place }], exceptions[], equipment: { powerMeter, hrStrap, smartTrainer, poolAccess }, injuries: { current[], past[] }, updatedBy, updatedAt }`. Jours absents en base → disponibles, sans limite.
- `PUT /api/athletes/:id/care/availability` corps `{ weeklyMinutes: number|null, days: [7 × {...}] }` (remplace la semaine dans une transaction : `db().transaction`).
- `PUT /api/athletes/:id/care/equipment` corps `{ powerMeter, hrStrap, smartTrainer, poolAccess }`.
- `POST /api/athletes/:id/care/exceptions` `{ fromDay, toDay, note? }` ; `DELETE /api/athletes/:id/care/exceptions/:exceptionId`.
- `POST /api/athletes/:id/care/injuries` `{ title, startedOn, expectedEnd?, endedOn?, avoidSports[], avoidIntensity, note? }` ; `PUT …/injuries/:injuryId` ; `DELETE …/injuries/:injuryId`. Toujours filtrés par `user_id` (un id d'un autre athlète → 404).
- `POST /api/workouts/check` (coach seulement, 403 sinon) corps `{ athleteIds[], date, sport: Ride|Run|Swim, durationSec: number|null, usesPower: boolean, highIntensity: boolean }` → `{ results: [{ id, warnings: Warning[] }] }` (athlètes hors équipe ignorés, comme `POST /workouts`).
  `Warning = { kind: 'injury' | 'availability' | 'exception' | 'equipment', level: 'block' | 'warn', title, detail, suggestDate?: string }`, calculé par `checkWorkout` (pur) :
  - **injury / block** : blessure en cours à `date` dont `avoid_sports` contient le sport, ou `avoid_intensity` et `highIntensity` → « Paul : pas de course jusqu'au 15 déc. » + titre de la blessure.
  - **exception / block** : la date tombe dans une exception → « Julie est indisponible du 20 au 27 déc. ».
  - **availability / warn** : jour indisponible dans la semaine type → « Julie ne s'entraîne pas le lundi » ; ou `durationSec` > `max_minutes` du jour → « Julie n'a qu'1 h mardi » avec `suggestDate` = prochain jour (dans les 7 jours) disponible dont le temps suffit et sans exception.
  - **equipment / warn** : vélo, `usesPower` et pas de capteur ni de home trainer → « Sarah n'a pas de capteur de puissance ».
  - En **démo** (`config.demoMode`, pas de base pour les athlètes démo) : renvoyer des données démo stables en mémoire (une `Map` dans `lib/care.ts` ou un module `src/demoCare.ts` nouveau) : ex. `demo-2` blessé (pas de course jusqu'à J+20), `demo-1` lundi et vendredi indisponibles, mardi 60 min ; `demo-3` sans capteur. Les PUT en démo modifient cette `Map`.
- `POST /api/workouts` (team.ts) : avant l'envoi, pour chaque athlète, si `checkWorkout` donne un warning de niveau `block` et que son id n'est pas dans `body.force` (tableau optionnel de chaînes) → ne pas envoyer, résultat `{ id, ok: false, blocked: true, error: '<titre du warning>' }`. Le web envoie donc d'abord `POST /workouts/check`, puis `POST /workouts` avec `force` pour les athlètes confirmés. **Ne touche à rien d'autre dans team.ts.** (Le corps de `POST /workouts` contient déjà `sport` ; pour la durée et la puissance, ajoute `durationSec`, `usesPower`, `highIntensity` optionnels au corps ; absents → pas de contrôle de durée / matériel, mais le blocage blessure s'applique quand même sur le sport.)

## Web

- **Sélecteurs** : uniquement `components/common/NumberStepper.tsx` (boutons − / + et saisie directe). Volume visé en heures (pas 0,5, `format` « 8 h »), temps max d'un jour en minutes (pas 15, min 15, max 720, `format` « 1 h 30 »).
- `Availability.tsx` (maquette validée) : « Volume visé » ; « Semaine type » : 7 lignes (Lun…Dim) avec interrupteur disponible / repos ; si disponible : temps max, créneau (`Segmented` Indifférent / Matin / Midi / Soir), lieu (`Segmented` Indifférent / Extérieur / Home trainer) — dépliés dans la ligne (une ligne ouverte à la fois) ; « Exceptions » : liste + ajout dans une `Sheet` (du, au, note) + suppression. Bouton « Enregistrer » pour la semaine.
- `Health.tsx` : « En cours » (cartes : titre, depuis le …, à éviter : sports / intensité, jusqu'au … estimé, note) ; « Signaler une blessure ou une limitation » → `Sheet` (titre, début, fin estimée, sports à éviter en cases Vélo / Course / Natation, « Éviter les efforts au-dessus du seuil », note) ; modifier, marquer « guérie » (`endedOn` = aujourd'hui), supprimer ; « Historique » ; section « Matériel » avec 4 interrupteurs (capteur de puissance, ceinture cardio, home trainer connecté, accès piscine) enregistrés immédiatement. Pied : « Données de santé : visibles uniquement par toi et ton coach, jamais envoyées à Intervals.icu. »
- `AvailabilityRow` : résumé « 5 jours · 8 h/sem. » ; `EquipmentRow` : « Capteur, ceinture, HT » ; `HealthRow` : « 1 limitation en cours » en orange, sinon « Rien à signaler ».
- Si la dernière modification vient du coach et que l'athlète consulte sa fiche → « Modifié par ton coach le … ».
- `Workouts.tsx`, feuille de séance (`WorkoutSheet`) : quand date, sport, structure ou sélection d'athlètes changent (anti-rebond 400 ms), appeler `POST /workouts/check` avec `durationSec` = `workoutStats(parseWorkout(description)).seconds` si `complete` sinon `null`, `usesPower` = un palier `target === 'power'`, `highIntensity` = un palier ≥ 100 %. Afficher sous la liste des athlètes un bandeau par avertissement (orange `warn`, rouge `block`) ; pour `block`, bouton « Envoyer quand même » (ajoute l'id à `force`) ; pour `suggestDate`, texte « … conviendrait ». Le bouton principal indique le nombre réel d'envois (« Envoyer à 2 athlètes »). Après l'envoi, si des athlètes ont été bloqués, l'indiquer.
- `Calendar.tsx` : charger la fiche de l'athlète affiché (`useCare`) et griser (fond `var(--fill)`, libellé « repos » / « indisponible ») les jours non disponibles et les exceptions. Ne change rien d'autre.
- Design : skill `apple-design`, composants `@/components/ios`, clair et sombre, cibles ≥ 44 px.

## Politique de confidentialité (`pages/Privacy.tsx`)
Ajoute (FR et EN, mets à jour les deux dates) : données de profil saisies dans l'app (date de naissance, sexe, taille, poids, valeurs physiologiques, VMA et tests — envoyées à Intervals.icu quand elles y ont un équivalent) ; disponibilités et matériel ; **données de santé** (blessures et limitations) : saisies volontairement, visibles par l'athlète et son coach uniquement, jamais transmises à un tiers, effacées avec le compte (cascade). Base légale : consentement explicite (saisie volontaire, supprimable à tout moment).

## Tests attendus (Vitest)
- `lib/care.ts` : blessure en cours / finie / future ; blocage par sport et par intensité ; exception ; jour de repos ; durée > temps max avec `suggestDate` correct ; matériel ; validation des entrées (bornes, sports invalides, `toDay < fromDay` → 400).
- Routes : 401 ; 404 hors équipe ; coach modifie → `updated_by='coach'` ; isolation (un `injuryId` d'un autre athlète → 404) ; limites (31ᵉ exception → 409) ; `POST /workouts/check` 403 pour un athlète ; `POST /workouts` : athlète bloqué non envoyé, envoyé avec `force` (source mockée qui enregistre les écritures, comme `test/planning.test.ts`).
- Web : `lib/availability.test.ts`.

## Vérification finale
1. `npm run check` à la racine : tout vert (copie les lignes « Tests … passed » dans ton rapport).
2. Pas de vérification navigateur demandée (l'orchestrateur la fera).

## Rapport final (français, court)
Branche et commits ; ce qui est fait ; écarts au plan et pourquoi ; sortie de `npm run check` ; ce qui n'est pas vérifié ; liste exacte des fichiers modifiés hors liste (doit être vide).
