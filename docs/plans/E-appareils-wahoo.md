# E — Appareils reliés directement à l'app (Wahoo d'abord)

Objectif produit : se passer d'Intervals.icu pour les compteurs **Wahoo** (ELEMNT, KICKR) :
l'athlète relie son compte Wahoo à l'app ; ses **sorties Wahoo** arrivent directement dans
la copie des sorties de l'app (phase D), et les **séances prévues** du calendrier de l'app
(phase C) partent directement sur son ELEMNT. Le code est construit autour d'une interface
d'appareil commune pour ajouter **Garmin** et **Coros** plus tard (API réservées aux
partenaires validés : non implémentées ici, affichées « via Intervals.icu »).

L'app Wahoo (identifiants) **n'existe pas encore** : tout est désactivé tant que
`WAHOO_CLIENT_ID` / `WAHOO_CLIENT_SECRET` ne sont pas configurés, et entièrement testé avec
des réponses simulées.

Lis d'abord `CLAUDE.md` et les skills `.claude/skills/{bff-endpoint,database,external-provider,react-frontend,apple-design,testing,ship-check,deploy-infra}/SKILL.md`.
Code, commentaires et textes en français.

## Règles de travail (obligatoires)

- Branche `feat/appareils-e` depuis l'état actuel. Commits Conventional Commits en français terminés par `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. **Ne pas pousser, ne pas merger.**
- Tu es seul sur le dépôt, mais reste dans la liste des fichiers ci-dessous.
- **Aucun appel réseau** (ni Wahoo, ni Intervals.icu) : clients HTTP simulés dans les tests. Ne lis jamais `.env`.
- Jetons Wahoo : **chiffrés** en base avec `encrypt`/`decrypt` (`src/lib/crypto.ts`, clé `TOKEN_ENCRYPTION_KEY`), jamais journalisés ni renvoyés au web (comme les jetons Intervals.icu).
- `npm run check` (racine) vert à la fin, sortie lue.

## Faits vérifiés sur l'API Wahoo Cloud (doc officielle, ne pas réinventer)

- Hôte : `https://api.wahooligan.com`. Accès soumis à **validation par Wahoo** ; app sandbox (25 req / 5 min, 100 / h, 250 / jour) et app production distinctes (200 / 5 min, 1000 / h, 5000 / jour). En-têtes `X-RateLimit-*`.
- OAuth 2 : `GET /oauth/authorize?client_id&redirect_uri&scope&response_type=code` (+ `code_challenge`, `code_challenge_method=S256` : PKCE supporté), `POST /oauth/token` (`client_id`, `client_secret`, `code`, `redirect_uri`, `grant_type=authorization_code` ; le refresh : `grant_type=refresh_token`, `refresh_token`). Jeton d'accès valable **2 h** ; le refresh renvoie **un nouveau refresh_token** ; l'ancien couple est révoqué dès le premier appel fait avec le nouveau jeton → **ne rafraîchir que juste avant un appel**, et enregistrer le nouveau couple **avant** de l'utiliser. 10 jetons non révoqués au plus par utilisateur.
- Scopes : `user_read` (obligatoire), `workouts_read`, `workouts_write`, `plans_read`, `plans_write`, `power_zones_read`, `offline_data` (webhooks). Demander : `user_read workouts_read workouts_write plans_write offline_data` (séparés par des espaces).
- Déconnexion : `DELETE /v1/permissions`.
- Utilisateur : `GET /v1/user` → `id` (identifiant Wahoo à mémoriser pour les webhooks).
- **Webhook** (réglé dans le portail Wahoo : `webhook_url` + `webhook_token`) : `POST` JSON, seul type documenté `event_type: "workout_summary"`, corps `{ event_type, webhook_token, user: { id }, workout_summary: { id, power_avg, power_bike_np_last, power_bike_tss_last, heart_rate_avg, distance_accum (m), duration_active_accum, duration_total_accum (s), ascent_accum, cadence_avg, calories_accum, work_accum, file: { url }, workout: { id, starts, minutes, name, plan_id, workout_type_id } } }`. Valeurs décimales envoyées **en chaînes**. Vérification : comparer `webhook_token` du corps au secret (pas de signature). Réponse non-200 → nouvelles tentatives (30 min, 4 h, 24 h, 72 h) ; doublons possibles.
- Wahoo **ne transmet pas** les sorties créées par des apps tierces (`fitness_app_id` > 1000) : seulement celles de ses appareils.
- Lecture : `GET /v1/workouts/:id` (avec `workout_summary`), `GET /v1/workouts?page&per_page`, `GET /v1/workouts/:id/workout_summary`.
- **Pousser une séance** (2 étapes) : (1) `POST /v1/plans` avec `plan[file]` = `data:application/json;base64,<plan.json en base64>`, `plan[filename]`, `plan[external_id]` (unique, requis), `plan[provider_updated_at]` (requis) → `id` ; `PUT /v1/plans/:id` pour le mettre à jour (même app) ; `DELETE /v1/plans/:id`. (2) `POST /v1/workouts` avec `workout[name]`, `workout[workout_token]` (identifiant unique côté app), `workout[workout_type_id]`, `workout[starts]` (ISO, ex. `2026-12-02T07:00:00.000Z`), `workout[minutes]`, `workout[plan_id]`. Envoyer en `application/json` sous la forme `{ "plan": { "file": …, "filename": …, "external_id": …, "provider_updated_at": … } }` et `{ "workout": { … } }`.
- **Affichage sur le compteur** : seulement si la séance est datée **d'aujourd'hui à J+6**. Les compteurs n'utilisent que la **première cible** de chaque intervalle.
- **Format plan.json** (version `1.0.0`) :
  ```json
  { "header": { "name": "…", "version": "1.0.0", "description": "…", "workout_type_family": 0, "workout_type_location": 1, "ftp": 245, "threshold_hr": 172, "threshold_speed": 3.6 },
    "intervals": [
      { "name": "Échauffement", "exit_trigger_type": "time", "exit_trigger_value": 600, "intensity_type": "wu",
        "targets": [ { "type": "ftp", "low": 0.5, "high": 0.75 }, { "type": "rpm", "low": 85, "high": 95 } ] },
      { "name": "3 ×", "exit_trigger_type": "repeat", "exit_trigger_value": 2,
        "intervals": [ { "exit_trigger_type": "distance", "exit_trigger_value": 400, "intensity_type": "lt", "targets": [ { "type": "threshold_speed", "low": 1.03, "high": 1.05 } ] } ] } ] }
  ```
  `workout_type_family` : 0 vélo, 1 course (pas de natation). `workout_type_location` : 0 intérieur, 1 extérieur. `exit_trigger_type` : `time` (s), `distance` (m), `repeat` (`exit_trigger_value` = nombre de répétitions **en plus** de la première). Cibles relatives = fractions : `ftp` (de la FTP du header), `threshold_hr`, `max_hr`, `threshold_speed` ; absolues : `watts`, `hr`, `rpm`, `speed` (m/s). `intensity_type` : `active` (défaut), `wu`, `tempo`, `lt`, `map`, `ac`, `nm`, `ftp`, `cd`, `recover`, `rest`.

## Fichiers autorisés

BFF : `migrations/010_devices.sql` (nouveau) ; `src/devices/types.ts` (interface d'appareil commune), `src/devices/wahoo.ts` (client Wahoo : OAuth, rafraîchissement, appels), `src/devices/wahooPlan.ts` (pur : séance texte → plan.json), `src/devices/service.ts` (connexion, envoi des séances, réception des sorties), `src/db/deviceRepo.ts` (nouveaux) ; `src/lib/workoutText.ts` (nouveau, pur : **port** côté serveur du lecteur de séances du web `apps/web/src/lib/workout.ts` + `workoutBlocks.ts` — paliers durée / distance, rampes, % FTP / `LTHR` / `Pace`, cadence, répétitions ; garder la même syntaxe, tests repris) ; `src/routes/devices.ts` (remplacer le stub) ; `src/calendarService.ts` (**seulement** : appeler le service d'appareils après une création / modification / suppression réussie en base — erreurs isolées, jamais bloquantes) ; `src/jobs/devicePush.ts` (nouveau : toutes les heures, pousser les séances qui entrent dans la fenêtre J..J+6) ; `src/index.ts` (démarrer ce job) ; `src/config.ts` (`wahooClientId`, `wahooClientSecret`, `wahooWebhookToken` en `opt`) ; `.env.example` (BFF), `.env.prod.example`, `docker-compose.prod.yml`, `DEPLOY.md` (variables + procédure : créer l'app sandbox/production sur developers.wahooligan.com, redirect `<PUBLIC_API_URL>/api/public/devices/wahoo/callback`, webhook `<PUBLIC_API_URL>/api/public/webhooks/wahoo` + token, scopes) ; tests `test/devices*.test.ts`, `test/wahoo*.test.ts`, `test/workoutText.test.ts` (nouveaux).
Web : `services/devicesApi.ts`, `hooks/useDevices.ts` (nouveaux), `pages/profile/Devices.tsx` (remplacer le stub, garder `default`, `DevicesRow`, `RowProps`), `pages/Privacy.tsx` (Wahoo comme destinataire).

## Données (migration 010)

```sql
create table device_connections (
  user_id            uuid not null references users(id) on delete cascade,
  provider           text not null check (provider in ('wahoo', 'garmin', 'coros')),
  external_user_id   text not null check (length(external_user_id) <= 64),
  access_token_enc   text not null,
  refresh_token_enc  text not null,
  expires_at         timestamptz not null,
  scope              text not null default '',
  connected_at       timestamptz not null default now(),
  last_error         text check (length(last_error) <= 300),
  primary key (user_id, provider)
);
create unique index device_connections_external_idx on device_connections (provider, external_user_id);

create table device_pushes (            -- séances poussées vers un appareil
  user_id       uuid not null references users(id) on delete cascade,
  provider      text not null,
  event_id      uuid not null references calendar_events(id) on delete cascade,
  plan_id       text, workout_id text,
  pushed_at     timestamptz not null default now(),
  content_hash  text not null,            -- pour ne repousser que si la séance a changé
  status        text not null check (status in ('pushed', 'error', 'skipped')),
  error         text check (length(error) <= 300),
  primary key (user_id, provider, event_id)
);
```

## Comportement

- **Connexion** : `POST /api/devices/wahoo/connect` (session requise ; l'athlète lui-même uniquement) → `{ url }` d'autorisation (state aléatoire + vérificateur PKCE dans Redis 10 min, lié à l'utilisateur, comme `routes/intervalsAuth.ts`). `GET /api/public/devices/wahoo/callback?code&state` : state à usage unique (`GETDEL`), échange du code, `GET /v1/user`, enregistrement chiffré, redirection vers `<APP_URL>profil/appareils#wahoo=ok` (ou `#erreur=…`). 503 si Wahoo non configuré.
- **Statut** : `GET /api/athletes/:id/devices` (lui-même ou son coach, `assertCanView`) → `[{ provider, label, connected, connectedAt, lastError, direct: true|false }]` : Wahoo (direct, si configuré), Garmin / Coros (`direct: false`, « via Intervals.icu », état lu dans `/me/setup` existant si utile).
- **Déconnexion** : `DELETE /api/devices/wahoo` → `DELETE /v1/permissions` (au mieux) puis suppression de la ligne.
- **Jeton** : avant chaque appel, si `expires_at < now + 5 min` → refresh, **enregistrer** le nouveau couple, puis appeler. 401 Wahoo → marquer `last_error = 'Reconnexion Wahoo nécessaire'`, ne pas réessayer en boucle.
- **Envoi des séances** (`service.pushEvent(userId, row)`) : seulement `kind = 'workout'`, sport `Ride` ou `Run`, date entre aujourd'hui et J+6 (heure de Paris), athlète relié à Wahoo. Construire le plan avec `wahooPlan.ts` (seuils de la fiche profil A1 : `dbProfileStore(userId).load()` ; FTP vélo, FC seuil, vitesse seuil course = 1000 / s par km) ; `content_hash` = sha256(plan + date) ; si identique à `device_pushes` → rien ; sinon `POST /v1/plans` (ou `PUT /v1/plans/:id` si déjà créé) puis `POST /v1/workouts` (`starts` = date à 07:00 heure de Paris en UTC, `minutes` = durée estimée, `workout_token` = id de l'événement, `workout_type_id` = 0 pour vélo / 1 pour course : valeurs à confirmer, constantes nommées). Suppression d'une séance → `DELETE /v1/plans/:id` (au mieux). Erreur → `status='error'` + message ; jamais d'exception vers la route du calendrier. Séance non convertible (natation, `Z2`, watts absolus, % FC max…) → `status='skipped'` avec la raison.
- **Conversion** (`wahooPlan.ts`, pur) : palier → `targets` : % FTP → `ftp` (fraction, plage ou valeur) ; `LTHR` → `threshold_hr` ; `Pace` → `threshold_speed` ; cadence → cible `rpm` **après** la cible principale ; rampe → un intervalle avec la plage début → fin ; répétition N× → `exit_trigger_type: 'repeat'`, `exit_trigger_value: N − 1`, `intervals` = les paliers ; titre de section → `name` ; `intensity_type` déduit (premier palier d'une séance → `wu`, dernier → `cd`, ≥ 100 % → `lt`, < 60 % → `recover`, sinon `active`).
- **Réception des sorties** : `POST /api/public/webhooks/wahoo` : 404 si non configuré ; `webhook_token` comparé en temps constant à `WAHOO_WEBHOOK_TOKEN` (401 sinon) ; `event_type !== 'workout_summary'` → 200 ignoré ; retrouver l'athlète par `user.id` ; enregistrer la sortie dans la copie des sorties (phase D : `activityStore` / `db/activityRepo.ts`, `source = 'wahoo'`, id `wahoo-<workout_summary.id>`, champs du résumé convertis, `streams_status = 'none'`, charge = `power_bike_tss_last` si présent avec `load_method` documenté, sinon calcul simple depuis la puissance pondérée et la FTP de la fiche) ; **doublon** : si une sortie Intervals.icu du même athlète démarre à ± 3 min → ne pas créer de seconde sortie (la copie Intervals.icu fait foi) ; sinon notifier le coach (réutiliser `rideNotification` + `pushNotify` de `jobs/sync.ts`) une seule fois (clé de dédoublonnage `seen_activities`). Répondre 200 dans tous les cas traités (y compris doublon).
- **Démo** : aucun appareil réel ; `GET /athletes/:id/devices` renvoie Wahoo non configuré.

## Web (`pages/profile/Devices.tsx`)
Liste « Reliés directement » : Wahoo (logo texte, état, bouton « Relier mon compte Wahoo » → ouvre l'URL renvoyée ; « Déconnecter » avec confirmation ; dernière erreur) ; si Wahoo n'est pas configuré sur le serveur → « Bientôt disponible ». Liste « Via Intervals.icu » : Garmin, Coros, Suunto (état lu dans `/me/setup`), pied : « La connexion directe Garmin et Coros demande un accès partenaire ; en attendant, elles passent par Intervals.icu. » Lecture seule pour le coach. Au retour (`#wahoo=ok` / `#erreur=…`) : message de confirmation ou d'erreur. `DevicesRow` : résumé (« Wahoo relié » / « Via Intervals.icu »).

## Tests attendus
- `lib/workoutText.ts` : mêmes cas que `apps/web/src/lib/workout.test.ts` et `workoutBlocks.test.ts` (lecture).
- `wahooPlan.ts` : séance vélo avec rampe, répétition, cadence → JSON attendu exact ; course en `Pace` et `LTHR` ; natation → non convertible ; % FC max → non convertible.
- Client Wahoo : URL d'autorisation (PKCE), échange, refresh (nouveau couple enregistré avant l'appel), 401 → `last_error`.
- Routes : connect 401 sans session / 503 non configuré ; callback state invalide → redirection `#erreur` ; statut (404 hors équipe) ; déconnexion ; webhook 404 / 401 / 200 doublon / 200 nouvelle sortie (ligne `source='wahoo'` + notification une seule fois même si livré deux fois).
- Envoi : création de séance J+2 → plan + workout appelés ; même contenu → rien ; J+10 → rien (le job la poussera) ; natation → `skipped` ; erreur Wahoo → n'empêche pas la création côté calendrier.

## Rapport final (français, court)
Commits ; fait ; écarts au plan et pourquoi ; lignes « Tests … passed » de `npm run check` ; non vérifié (tout ce qui demande la vraie app Wahoo) ; fichiers touchés hors liste (doit être vide).
