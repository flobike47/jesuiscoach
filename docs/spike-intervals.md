# Spike API Intervals.icu — 25 novembre 2026

Exploration avec la clé API personnelle du coach (Basic `API_KEY:<clé>`, athlète
`0` = propriétaire de la clé), compte relié à Garmin, ~120 sorties sur un an.
Lecture, puis un test d'écriture du calendrier (séance de test créée, déplacée
puis supprimée, avec accord du coach). Script d'exploration hors dépôt (n'affiche
que la structure des réponses).

## Ce qui est confirmé

| Besoin de l'app | Endpoint | Résultat |
|---|---|---|
| Profil, FTP, zones | `GET /athlete/{id}` | `name`, `timezone`, `sportSettings[]` par groupe de sports (`types: ['Ride','VirtualRide','MountainBikeRide','GravelRide',…]`) avec `ftp`, `lthr`, `max_hr`, `power_zones` (% FTP, 7 zones), `hr_zones` (bpm), `sweet_spot_min/max`. Réglages Garmin visibles : `icu_garmin_upload_workouts` (séances envoyées à la montre). |
| Forme | `GET /athlete/{id}/wellness?oldest&newest` | Un objet par jour (`id` = date) : `ctl`, `atl`, `rampRate`, `sportInfo[].eftp` (FTP estimée), HRV / sommeil / FC repos si synchronisés (ici `null`). |
| Sorties | `GET /athlete/{id}/activities?oldest&newest` | **Plus récente d'abord.** `icu_training_load`, `icu_weighted_avg_watts`, `icu_average_watts`, `icu_intensity` (**en %**, 65.3 = 0,653), `icu_ftp`, `moving_time`, `distance`, `total_elevation_gain`, `icu_zone_times` (Z1…Z7 + SS, en s), `interval_summary`, `stream_types`, `paired_event_id`, `compliance`. |
| Détail d'une sortie | `GET /activity/{id}?intervals=true` | `icu_intervals[]` (type WORK/RECOVERY, `start_index`/`end_index`, `average_watts`, `weighted_average_watts`, `intensity`, `zone`, `average_heartrate`, `average_cadence`, `training_load`, `decoupling`…) et `icu_groups[]` (répétitions regroupées). |
| Courbes (graphiques) | `GET /activity/{id}/streams.json?types=watts,heartrate,cadence,time` | Liste `[{ type, data: [...] }]`, un point par seconde ; les types absents sont omis (ici pas de cardio). |
| Courbe de puissance d'une sortie | `GET /activity/{id}/power-curve.json` | `secs[]`, `watts[]`, `watts_per_kg[]`, `vo2max_5m`. |
| Courbe de puissance de l'athlète | `GET /athlete/{id}/power-curves.json?type=Ride&curves=90d,1y` | `{ list: [{ id: '90d', secs[], values[], activity_id[], watts_per_kg[], powerModels[] (CP, W') }], activities: { id → résumé } }` : records et sortie d'origine de chaque record. |
| Bibliothèque | `GET /athlete/{id}/folders` | Dossiers (`type: FOLDER` / plans), `children` = séances, `canEdit`. |
| Calendrier (lecture) | `GET /athlete/{id}/events?oldest&newest` | Liste des événements de la période. |
| Créer une séance | `POST /athlete/{id}/events` `{ category: 'WORKOUT', type: 'Ride', start_date_local: 'AAAA-MM-JJT00:00:00', name, description }` | 200, `id` **numérique**. Le format texte de l'app est compris : `workout_doc` (étapes, `zoneTimes` en watts), `moving_time`, `icu_training_load`, `icu_intensity` calculés par Intervals.icu. |
| Déplacer | `PUT /athlete/{id}/events/{eventId}` `{ start_date_local }` | 200 ; nom et contenu conservés (mise à jour partielle). |
| Supprimer | `DELETE /athlete/{id}/events/{eventId}` | 200 ; la séance disparaît du calendrier. |

En-têtes de quota (`X-RateLimit-*`) **absents** en clé API : impossible de
suivre le quota restant côté client, d'où l'importance du cache Redis.

## Pièges trouvés

1. **Sorties Strava = coquilles vides.** Les sorties importées via Strava
   reviennent sous la forme `{ id, start_date_local, source: 'STRAVA',
   _note: 'STRAVA activities are not available via the API' }`, sans type ni
   mesures (10 sur 120 ici). → Filtrées dans `providers/intervals.ts`
   (`usableActivities`). Conseil aux athlètes : synchroniser **Garmin
   directement** vers Intervals.icu, pas via Strava.
2. **`icu_intensity` est en pourcentage**, pas en fraction (déjà géré : le web
   divise par 100).
3. **Toutes les sorties n'ont pas la puissance ni le cardio** (ici 89/120 avec
   puissance, 12/120 avec cardio) : chaque graphique doit gérer l'absence.
4. **Identifiants hétérogènes** : `i…` pour les sorties Intervals, purement
   numériques pour d'anciennes sorties → toujours traiter `id` comme une chaîne.

## Pas encore vérifié

- **Appariement prévu ↔ réalisé** (`paired_event_id`, `compliance`) : demande
  une vraie sortie faite le jour d'une séance prévue.
- **Envoi vers la montre** d'une séance future (`icu_garmin_upload_workouts`) :
  non testé, la séance de test était datée dans le passé.
- **Webhooks** : réservés aux apps OAuth (page « Manage App »), testables après
  validation de l'app.
- **Accès coach → athlète** : un seul compte disponible ; à vérifier avec un
  ami invité.

## Calcul de la charge d'une séance

Pour une séance prévue, Intervals.icu calcule l'intensité comme une puissance
normalisée : moyenne de l'intensité **à la puissance 4**, puis racine 4e ; charge
= intensité² × heures × 100. Séance de référence (échauffement rampe 10 min,
3 × (5 min 95 % + 3 min 55 %), 5 min 50 %) : 2 340 s, intensité 78,4 %, charge
40. L'éditeur de l'app (`apps/web/src/lib/workout.ts`) utilisait des carrés
(charge 36) ; il applique désormais la même méthode (test de référence).

## Conséquences pour la suite

- **Dashboards** : zones par semaine = somme des `icu_zone_times` (pas de
  calcul côté app) ; courbe de puissance 90 j / 1 an et records directement
  depuis `power-curves.json` ; détail d'une sortie = `icu_intervals` + streams.
- **Conformité** : remplacer l'heuristique « une sortie le même jour » par
  `paired_event_id` / `compliance` quand ils sont présents (à confirmer).
- **Zones et FTP par athlète** : lire `sportSettings` du groupe vélo
  (`power_zones` en % de `ftp`) plutôt que des seuils fixes.

## Écriture des réglages (fiche profil)

- `PUT /athlete/{id}/sport-settings/{Ride|Run|Swim}?recalcHrZones=true` avec un
  corps partiel `{ ftp?, lthr?, max_hr?, threshold_pace? }` : seuls les champs
  envoyés changent. Scope `SETTINGS:WRITE`.
- `threshold_pace` est en **mètres par seconde**, quelle que soit `pace_units`.
  Exemple réel : natation `0.8333333` avec `SECS_100M` = 2:00/100 m. Conversions
  dans `apps/bff/src/lib/profile.ts` (`thresholdSecsOf`, `thresholdPaceOf`).
- `PUT /athlete/{id}` (poids, FC repos, sexe, taille, date de naissance) : scope
  `SETTINGS:WRITE`. La forme du jour passe par `PUT /athlete/{id}/wellness/{AAAA-MM-JJ}`
  (`weight`, `restingHR`) : scope `WELLNESS:WRITE`.
- Un compte connecté avant l'ajout de ces scopes n'a que `SETTINGS:READ` et
  `WELLNESS:READ` : l'app enregistre quand même, signale « reconnexion nécessaire »
  et n'appelle pas l'écriture.
- Les valeurs sans équivalent chez Intervals.icu (VMA, tests physiques) restent dans l'app.
