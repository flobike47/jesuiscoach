# B + D — Copie des sorties dans l'app et calculs faits par l'app

Objectif produit : l'app garde **sa propre copie** des sorties (résumé + courbes seconde par
seconde) et **calcule elle-même** Puissance pondérée, Intensité, Charge, temps par zone,
meilleures puissances, Fitness / Fatigue / Forme — à partir des seuils de **la fiche profil
de l'app** (FTP, FC seuil, allure seuil). Intervals.icu ne sert plus qu'à **apporter** les
sorties. Les valeurs d'Intervals.icu sont **gardées à côté** pour comparer, et servent de
repli tant qu'une sortie n'a pas encore ses courbes.

Lis d'abord `CLAUDE.md` et les skills `.claude/skills/{bff-endpoint,database,external-provider,testing,ship-check}/SKILL.md`.
Code, commentaires et textes en français. Vocabulaire : « Charge », « Puissance pondérée », « Intensité », « Fitness », « Fatigue », « Forme » (jamais TSS / NP / IF / CTL / ATL dans les textes visibles ; ces sigles sont tolérés dans les noms de variables internes).

## Règles de travail (obligatoires)

- Branche `feat/calculs-d` depuis l'état actuel (base commune commitée). Commits Conventional Commits en français terminés par `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. **Ne pas pousser, ne pas merger.**
- Un autre agent (C : calendrier) travaille en parallèle. **Ne touche QUE les fichiers listés.** Interdits notamment : `apps/bff/src/routes/calendar.ts`, `routes/planning.ts`, `routes/care.ts`, `routes/profile.ts`, `sources.ts`, `providers/*`, `demo.ts`, `types.ts` (BFF), `db/repo.ts`, `server.ts`, tout le web sauf `pages/Privacy.tsx`.
- **Les formes de réponse des routes existantes ne changent pas** (le web n'est pas modifié) ; tu peux seulement **ajouter** des champs (ex. `source: 'app' | 'intervals'`).
- Aucun appel réel à Intervals.icu (sources mockées). Ne lis jamais `.env`.
- `npm run check` (racine) vert à la fin, sortie lue.

## Déjà fourni (à utiliser, ne pas recréer)

- `AthleteSource.activities(id, from, to)` (résumés Intervals, cache 10 min), `AthleteSource.rawStreams(id, activityId)` → `IntervalsStream[]` (`time`, `watts`, `heartrate`, `cadence`, `velocity_smooth`, `distance`, `altitude`, un point par seconde enregistrée ; types absents omis), **sans cache** : chaque appel coûte une requête du quota de l'athlète (100 / jour en OAuth). Démo : `rawStreams` implémenté (un point toutes les 5 s).
- Seuils de l'app : `dbProfileStore(userId).load()` (`src/db/profileRepo.ts`) ou `demoProfileStore(athleteId).load()` (`src/demoProfile.ts`) → `physiology.Ride.ftp`, `physiology.{Ride,Run,Swim}.lthr|maxHr`, `physiology.Run.thresholdSecs` (s/km), `physiology.Swim.thresholdSecs` (s/100 m), `identity.restingHr`. Peut être `null` (fiche jamais ouverte) → repli sur `ftpOf(athlete)` (`lib/summary.ts`) / sportSettings d'Intervals.
- Synchro existante : `jobs/sync.ts` (`syncAthlete` lit déjà les sorties des 8 derniers jours à chaque passage) et `jobs/webhook.ts` (synchro déclenchée à chaque sortie).

## Fichiers autorisés

BFF : `migrations/009_activities.sql` (nouveau), `src/db/activityRepo.ts` (nouveau), `src/lib/metrics.ts` (nouveau, **pur**), `src/lib/fitness.ts` (nouveau, **pur**), `src/activityStore.ts` (nouveau : enregistrer une sortie + ses courbes + ses calculs ; magasin mémoire en démo), `src/jobs/backfill.ts` (nouveau), `src/jobs/sync.ts`, `src/jobs/webhook.ts` (seulement si utile), `src/index.ts` (démarrer le rattrapage), `src/routes/team.ts` (`/team`, `/athletes/:id/overview`, `/feed`), `src/routes/dashboards.ts`, `src/routes/athlete.ts` (`/me/today` si utile), `src/routes/metrics.ts` (stub déjà créé et branché dans `server.ts` : remplace son contenu, voir « Comparaison »). Tests `test/metrics*.test.ts`, `test/fitness.test.ts`, `test/activities*.test.ts` (nouveaux) ; adapter les tests existants seulement si nécessaire. Web : `pages/Privacy.tsx` uniquement.

## Données (migration 009)

```sql
create table activities (
  user_id            uuid not null references users(id) on delete cascade,
  id                 text not null check (length(id) between 1 and 64),    -- id Intervals.icu (ou autre source)
  source             text not null default 'intervals' check (source in ('intervals', 'wahoo', 'garmin', 'coros')),
  start_utc          timestamptz,
  start_local        text not null check (length(start_local) between 10 and 25), -- AAAA-MM-JJTHH:MM:SS
  sport              text,                                                  -- Ride / Run / Swim / autre type brut
  type_raw           text,
  name               text check (length(name) <= 200),
  moving_secs        integer, elapsed_secs integer, distance_m numeric(10,1), elevation_m numeric(7,1),
  avg_hr             smallint, max_hr smallint, avg_watts smallint, avg_cadence smallint,
  -- Calculs de l'app (null tant que les courbes ne sont pas là)
  weighted_watts     smallint,            -- Puissance pondérée
  intensity          numeric(4,3),        -- fraction (0,853)
  load               numeric(6,1),        -- Charge
  load_method        text check (load_method in ('power', 'hr', 'pace', 'none')),
  ftp_used           smallint, lthr_used smallint,
  power_zone_secs    integer[],           -- Z1…Z7
  hr_zone_secs       integer[],           -- Z1…Z5 (Friel)
  -- Valeurs d'Intervals.icu (comparaison et repli)
  icu_load           numeric(6,1), icu_weighted_watts smallint, icu_intensity numeric(4,3),
  icu_raw            jsonb,               -- résumé Intervals tel que reçu (champs utiles au web)
  streams_status     text not null default 'missing' check (streams_status in ('missing', 'stored', 'none', 'error')),
  computed_at        timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, id)
);
create index activities_user_start_idx on activities (user_id, start_local desc);

create table activity_streams (
  user_id      uuid not null,
  activity_id  text not null,
  data         bytea not null,              -- JSON { time, watts, heartrate, cadence, velocity, distance, altitude } compressé gzip
  points       integer not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, activity_id),
  foreign key (user_id, activity_id) references activities(user_id, id) on delete cascade
);

create table activity_bests (           -- meilleure puissance moyenne par durée, par sortie
  user_id      uuid not null,
  activity_id  text not null,
  secs         integer not null,
  watts        smallint not null,
  primary key (user_id, activity_id, secs),
  foreign key (user_id, activity_id) references activities(user_id, id) on delete cascade
);
create index activity_bests_user_secs_idx on activity_bests (user_id, secs, watts desc);
```
Compression : `zlib.gzipSync` / `gunzipSync` (Node). Pas de limite de nombre (≈ 30 Ko par sortie).

## Calculs (lib/metrics.ts et lib/fitness.ts — purs, testés)

Entrée : séries alignées sur `time` (secondes depuis le départ ; trous possibles). Ré-échantillonner à 1 Hz par répétition de la dernière valeur connue **seulement pour les trous ≤ 5 s** ; au-delà, la pause compte pour 0 W et n'entre pas dans la moyenne glissante (garder simple et documenter).
- **Puissance pondérée** : moyenne glissante sur 30 s de la puissance, à la puissance 4, moyenne, racine 4e (arrondi à l'entier). Nécessite ≥ 30 s de données.
- **Intensité** = puissance pondérée / FTP. **Charge (puissance)** = `secs × PP × Intensité / (FTP × 3600) × 100` avec `secs` = temps en mouvement (points avec puissance > 0 ou vitesse > 0,5 m/s ; à défaut `moving_secs`).
- **Charge (cardio)**, si pas de puissance utilisable (ou pas de FTP) mais cardio + FC seuil : TRIMP de Banister normalisé pour qu'**1 h à la FC seuil = 100** : `trimp = Σ dt/60 × r × 0,64 × e^(1,92 r)` avec `r = (fc − fcRepos) / (fcMax − fcRepos)` borné [0, 1] ; `charge = trimp / trimpSeuil1h × 100`, où `trimpSeuil1h` = la même formule pour 60 min à `fc = FC seuil`. Valeurs par défaut si absentes : FC repos 60, FC max = FC seuil / 0,92.
- **Charge (allure)**, course sans puissance ni cardio : `heures × (vitesse moyenne / vitesse seuil)² × 100` (vitesse seuil = 1000 / s/km). Natation : idem avec 100 / s/100 m.
- Sinon `load_method = 'none'`, charge 0.
- **Zones de puissance** (Coggan, bornes hautes en % FTP : 55, 75, 90, 105, 120, 150, ∞) → secondes par zone Z1…Z7. **Zones cardio** (Friel, % FC seuil : 81, 90, 94, 100, ∞) → Z1…Z5.
- **Meilleures puissances** pour `[1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800, 14400]` s : moyenne glissante maximale (somme glissante, O(n) par durée), seulement si la sortie dure au moins cette durée.
- **Fitness / Fatigue** (lib/fitness.ts) à partir de la charge **par jour** (somme des sorties du jour, `start_local`) : `fitness_j = fitness_{j-1} + (charge_j − fitness_{j-1}) × (1 − e^(−1/42))`, `fatigue` idem avec 7 ; `forme_j = fitness_{j-1} − fatigue_{j-1}` (forme du matin) ; `rampe` = fitness_j − fitness_{j−7}. **Point de départ** : le jour le plus ancien calculé reprend `ctl` / `atl` de la wellness Intervals.icu de ce jour-là (sinon 0) — évite un démarrage à froid.
- Charge d'une sortie pour la série : celle de l'app si calculée, sinon `icu_load` (repli), sinon 0.

## Ingestion (activityStore.ts, jobs)

- `syncAthlete` (jobs/sync.ts) : après avoir lu les sorties, **upsert** de chaque résumé dans `activities` (aucun appel en plus). Pour chaque **nouvelle** sortie (`fresh`) : `rawStreams` (1 requête), stocker les courbes, calculer, enregistrer (`streams_status='stored'`, ou `'none'` si aucune courbe exploitable ; erreur → `'error'`, ne bloque pas la notification). Ne change rien au comportement des notifications (tests existants verts).
- **Rattrapage** (jobs/backfill.ts) : toutes les 30 min, verrou Redis comme `startSync`, désactivé en démo ; pour chaque athlète connecté : (1) si aucune sortie en base sur 90 jours → upsert des résumés des 90 derniers jours (1 requête `activities`) ; (2) au plus **10** `rawStreams` par athlète et par **jour** (compteur Redis `backfill:{userId}:{AAAA-MM-JJ}` avec TTL 36 h, `SET NX EX` + `INCR` en MULTI) pour les sorties `streams_status='missing'`, des plus récentes aux plus anciennes. Démarré dans `index.ts` à côté de `startSync`.
- **Recalcul** quand la FTP / FC seuil change : fonction `recomputeAthlete(userId)` (recalcule depuis les courbes stockées, aucun appel Intervals) appelée par le rattrapage si `ftp_used` / `lthr_used` diffèrent des seuils actuels de la fiche (au plus 200 sorties par passage).
- **Démo** : `activityStore` en mémoire (Map) alimenté à la demande depuis `DemoSource` (sorties + `rawStreams`), même logique de calcul, sans base.

## Lecture (mêmes formes de réponse qu'aujourd'hui)

- `GET /athletes/:id/overview` : `series` (fitness / fatigue / form) et `summary.fitness|fatigue|form|ramp` depuis `lib/fitness.ts` (90 jours) **si** au moins une sortie de la période est en base, sinon comportement actuel (wellness Intervals). Ajouter `source: 'app' | 'intervals'`.
- `GET /team` : idem pour les indicateurs de chaque athlète (14 jours).
- `GET /athletes/:id/power` : courbes 90 j / 1 an depuis `activity_bests` (max par durée sur la fenêtre, avec l'id et le nom de la sortie d'origine), `models` : CP / W′ / FTP estimée calculés simplement (régression linéaire travail = CP × t + W′ sur les meilleures puissances de 3 à 20 min ; FTP estimée = 95 % de la meilleure 20 min) ; `ftp` = FTP de la fiche. Repli sur Intervals si aucune meilleure puissance en base.
- `GET /athletes/:id/zones` : temps par zone depuis `power_zone_secs` / `hr_zone_secs` (repli Intervals par sortie si absent) ; bornes des zones depuis la fiche.
- `GET /athletes/:id/activities/:activityId` : courbes depuis `activity_streams` (réduites avec `downsampleStreams` de `lib/dashboards.ts`), chiffres clés de l'app ; intervalles toujours lus chez Intervals (détail, cache 6 h) — repli complet sur l'existant si la sortie n'est pas en base.
- `GET /feed` et `/me/today` : charge de l'app quand elle existe (champ `icu_training_load` des objets renvoyés **remplacé** par la charge de l'app pour ne rien changer côté web), sinon celle d'Intervals.

## Comparaison (pour valider les calculs)

`GET /api/athletes/:id/metrics/compare?days=30` (athlète lui-même ou son coach) → `[{ id, name, date, sport, method, app: { load, weightedWatts, intensity }, intervals: { load, weightedWatts, intensity }, diffPct }]` + moyenne des écarts. Non affiché dans le web (l'orchestrateur s'en sert pour vérifier sur de vraies sorties).

## Politique de confidentialité (`pages/Privacy.tsx`, FR et EN)
Ajouter : copie des sorties (résumé et courbes seconde par seconde : puissance, fréquence cardiaque, cadence, vitesse, altitude, distance — **pas de position GPS**) conservée tant que le compte existe, effacée avec lui ; calculs faits par l'app. Supprimer / adapter la phrase actuelle qui parle d'une « copie temporaire en cache (30 jours au plus) ». Ne pas toucher au reste.

## Tests attendus
- `lib/metrics.ts` : puissance pondérée sur une série constante (= la valeur), sur 2 paliers (valeur connue calculée à la main dans le test), charge = 100 pour 1 h à la FTP, charge cardio = 100 pour 1 h à la FC seuil, charge allure, zones (somme = durée), meilleures puissances (palier de 5 min à 300 W → best 300 s = 300), trous > 5 s.
- `lib/fitness.ts` : charge constante → la fitness converge vers la charge ; départ repris de la wellness ; forme du matin.
- Ingestion : nouvelle sortie → `rawStreams` appelé une fois, ligne + courbes + calculs ; sortie sans courbes → `none` ; erreur → `error` sans casser la synchro ni les notifications ; rattrapage limité à 10 / jour ; recalcul après changement de FTP sans appel provider.
- Routes : `overview` avec `source: 'app'` quand des sorties sont en base, `intervals` sinon ; `power` depuis les meilleures puissances ; `compare` (401, 404 hors équipe) ; isolation entre athlètes.

## Rapport final (français, court)
Commits ; fait ; écarts au plan et pourquoi ; lignes « Tests … passed » de `npm run check` ; non vérifié ; fichiers touchés hors liste (doit être vide).
