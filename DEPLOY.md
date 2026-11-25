# Déploiement sur Raspberry Pi via Portainer

Flux cible :

```
push sur main
    │
    ▼
GitHub Actions (cross-build amd64 → arm64)
    │
    ▼
Registry privé (jesuiscoach-bff:latest + jesuiscoach-web:latest)
    │
    ▼
Portainer webhook (Pi) → pull + recreate des conteneurs
    │
    ▼
Caddy/Cloudflare Tunnel (host) → terminaison HTTPS
```

Tu fais juste `git push`, et 6 minutes plus tard la nouvelle version tourne sur la Pi.

---

## 1. Pré-requis sur la Pi

- Portainer CE installé (https://docs.portainer.io/start/install/server/docker/linux)
- Reverse proxy host pour TLS : Caddy (paquet apt) ou Cloudflare Tunnel
- Docker login vers ton registry (Portainer va gérer ça à ta place via "Registries")

## 2. Ajouter le registry dans Portainer

**Portainer UI → Registries → Add registry**

- **Name** : `mon-registry`
- **Registry URL** : `registry.example.com`
- **Authentication** : activé
- **Username / Password** : les credentials du registry

Portainer pourra ensuite pull les images privées automatiquement.

## 3. Créer la stack

**Portainer UI → Stacks → Add stack**

- **Name** : `jesuiscoach`
- **Build method** : Web editor
- Colle le contenu de [`docker-compose.prod.yml`](./docker-compose.prod.yml)
- En bas, section **Environment variables** → ajoute toutes les clés du
  [`.env.prod.example`](./.env.prod.example) avec leurs vraies valeurs :

| Variable | Pour qui | Exemple |
|---|---|---|
| `BFF_IMAGE` | compose | `registry.example.com/jesuiscoach-bff:latest` |
| `WEB_IMAGE` | compose | `registry.example.com/jesuiscoach-web:latest` |
| `CORS_ORIGIN` | BFF | `https://jesuiscoach.fb-cloud.fr` |
| `APP_URL` | BFF | optionnelle, `https://jesuiscoach.fb-cloud.fr/` : lien des notifications push. Par défaut la première origine de `CORS_ORIGIN` ; à renseigner si l'app est servie sous un `BASE_PATH` |
| **`BFF_URL`** | **web (runtime)** | **`https://jesuiscoach.fb-cloud.fr`** |
| `POSTGRES_PASSWORD` | Postgres + BFF | lettres et chiffres (⚠️ secret) |
| `BACKUP_DIR` | sauvegardes | `/mnt/ssd/backups/jesuiscoach` (dossier hôte) |
| `PUBLIC_API_URL` | BFF | `https://jesuiscoach.fb-cloud.fr` (callback OAuth) |
| `INTERVALS_CLIENT_ID`, `INTERVALS_CLIENT_SECRET` | BFF | app OAuth Intervals.icu (⚠️ secret) |
| `COACH_ATHLETE_IDS` | BFF | `i123456` : ton ID Intervals.icu (rôle coach) |
| `TOKEN_ENCRYPTION_KEY` | BFF | 32 octets base64 (⚠️ secret, ne plus jamais la changer) |
| `DEMO_MODE` | BFF | `false` en prod |
| `SYNC_INTERVAL_MIN` | BFF | `30` : fréquence de synchro des sorties (notifications au coach) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | BFF | notifications push, optionnelles (voir ci-dessous) |

**Notifications push (nouvelles sorties, alertes).** Génère une paire de clés
une seule fois, sur n'importe quelle machine :

```bash
npx web-push generate-vapid-keys
```

Renseigne `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (⚠️ secret) et `VAPID_SUBJECT`
(`mailto:toi@exemple.com`). Sans elles, le BFF démarre normalement et logge
« VAPID_* absentes » : aucune notification ne part. Ne change pas de paire ensuite :
tous les abonnements existants deviendraient invalides.

> La ligne en gras est injectée dans `/config.js` du conteneur web au
> démarrage. Tu peux la modifier dans Portainer puis redéployer la stack
> **sans rebuild d'image**.

Clique **Deploy the stack**. Portainer pull les images et démarre les cinq
conteneurs (postgres, postgres-backup, redis, bff, web). Le BFF applique
lui-même les migrations SQL (`apps/bff/migrations`) à son démarrage : rien à
lancer à la main.

### Base de données et sauvegardes

- Postgres tourne dans la stack, sans port publié : seul le BFF y accède.
- **Stockage** : mets Docker (ou au moins le volume `postgres-data`) sur un
  SSD. Une carte SD s'use vite sous les écritures de Postgres.
- **Sauvegardes** : le service `postgres-backup` fait un `pg_dump` compressé
  chaque jour dans `BACKUP_DIR` et garde 14 jours. Choisis un dossier sur un
  **autre disque** que la base, et copie-le ailleurs de temps en temps (NAS,
  cloud) : une sauvegarde sur le même disque ne protège pas d'une panne.
  Vérifie la ligne « sauvegarde OK » dans les logs du service.

#### Restaurer une sauvegarde

```bash
# Sur la Pi, depuis le dossier de la stack. Arrête le BFF pendant l'opération.
docker compose -f docker-compose.prod.yml stop bff
gunzip -c /mnt/ssd/backups/jesuiscoach/jesuiscoach-AAAA-MM-JJ.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U jesuiscoach -d jesuiscoach --single-transaction -v ON_ERROR_STOP=1
docker compose -f docker-compose.prod.yml start bff
```

La restauration s'applique à une base vide : pour repartir de zéro, supprime
d'abord le volume `postgres-data` (toutes les données actuelles sont perdues).
Teste la procédure une fois avant d'en avoir besoin.

### App OAuth Intervals.icu

1. Connecté avec **ton** compte Intervals.icu (celui du coach) : https://intervals.icu/oauth/apply
2. Redirect URI : `https://jesuiscoach.fb-cloud.fr/api/public/auth/intervals/callback`
3. L'app reste « Pending » jusqu'à validation manuelle par Intervals.icu. Ensuite,
   **Settings → Apps → Manage App** donne `client_id` et `client_secret`.
4. Ton ID d'athlète (ex. `i123456`, visible dans l'URL de ton profil) va dans
   `COACH_ATHLETE_IDS`. Les autres comptes ne peuvent s'inscrire qu'avec un lien
   d'invitation (Réglages → Inviter un athlète).
5. Chaque athlète doit activer l'envoi des séances vers Garmin dans Intervals.icu
   pour qu'elles arrivent sur sa montre.

En attendant la validation, la stack peut tourner avec `DEMO_MODE=true`
(équipe fictive, aucun appel Intervals.icu).

## 4. Activer le webhook de redeploy

Sur la stack créée : **onglet Webhooks → Create webhook**

Portainer génère une URL du type :

```
https://portainer.tondomaine.com/api/stacks/webhooks/<uuid>
```

**Copie-la** puis sur GitHub :

Repo → Settings → Secrets and variables → Actions → New secret :

- Name : `PORTAINER_WEBHOOK_URL`
- Value : l'URL ci-dessus

À partir de là, chaque push sur `main` :
1. CI build les deux images
2. Push sur le registry
3. POST sur le webhook → Portainer pull + recreate

## 5. Secrets GitHub Actions

Repo → Settings → Secrets and variables → Actions :

| Secret | Pour quoi |
|---|---|
| `REGISTRY_URL` | Host du registry (sans `https://`) |
| `REGISTRY_USERNAME` | Login push |
| `REGISTRY_USERPASSWORD` | Password / token push |
| `PORTAINER_WEBHOOK_URL` | URL du webhook stack (optionnel — sans, pas de redeploy auto) |

> Les `VITE_*` ne sont **plus** nécessaires côté CI : la config web est
> runtime (injectée par Portainer via env vars du conteneur), pas build-time.

## 6. HTTPS via Cloudflare Tunnel (ou Caddy)

Une seule adresse publique : le conteneur web sert l'app et relaie `/api/*`
au BFF par le réseau interne de la stack. Le compose ne publie que sur
`127.0.0.1` (jamais sur le LAN) :
- `127.0.0.1:8180` → web (app + `/api/*`) — **la seule cible du tunnel**
- `127.0.0.1:4100` → BFF direct, pour le diagnostic uniquement

**Cloudflare Tunnel** (celui d'investhelper suffit) — ajoute une règle dans
`~/.cloudflared/config.yml` (ou dans le tableau de bord Zero Trust si le
tunnel y est géré), **avant** la règle finale `http_status:404` :

```yaml
ingress:
  # … règles d'investhelper …
  - hostname: jesuiscoach.fb-cloud.fr
    service: http://localhost:8180
  - service: http_status:404
```

```bash
cloudflared tunnel route dns <nom-du-tunnel> jesuiscoach.fb-cloud.fr
sudo systemctl restart cloudflared
```

**Caddy global sur la Pi** (alternative) :

```caddy
jesuiscoach.fb-cloud.fr {
    reverse_proxy 127.0.0.1:8180
}
```

Variables correspondantes : `CORS_ORIGIN`, `BFF_URL` et `PUBLIC_API_URL` =
`https://jesuiscoach.fb-cloud.fr`.

## 7. Vérifications

```bash
# Depuis la Pi
curl http://localhost:4100/health
# → {"ok":true,"ts":...}

curl http://localhost:8180/
# → HTML du SPA

# Depuis ton browser
https://jesuiscoach.fb-cloud.fr
https://jesuiscoach.fb-cloud.fr/api/public/status
```

Dans Portainer, regarde les logs en direct (Containers → bff → Logs) — tu dois voir :
```
🟢 BFF up on http://0.0.0.0:4000 (env=production)
```

## 8. Rollback

Le CI tag chaque image avec `latest` ET `sha-<7chars>`. Pour rollback à une
version précédente :

1. Stack `jesuiscoach` → Editor
2. Change `BFF_IMAGE` ou `WEB_IMAGE` pour pointer sur `sha-abc1234`
3. Click **Update the stack**

Ou via webhook custom (si tu veux scripter).

## 9. Monitoring (suggéré)

- **Uptime** : UptimeRobot / Better Stack qui ping `https://jesuiscoach.fb-cloud.fr/api/public/status`
- **Logs persistés** : Portainer → Container settings → Restart policy = `unless-stopped` (déjà dans le compose), et active la rotation log Docker
- **Métriques** : Portainer affiche CPU/RAM live par conteneur

## 10. Mise à jour Portainer lui-même

```bash
docker pull portainer/portainer-ce:latest
docker stop portainer && docker rm portainer
docker run -d -p 9443:9443 --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

---

## Annexe — Build manuel (sans CI)

Si tu veux build à la main depuis ton laptop amd64 :

```bash
docker buildx create --use --name jesuiscoach-builder

docker buildx build --platform linux/arm64 -f apps/bff/Dockerfile \
  -t registry.example.com/jesuiscoach-bff:latest --push .

docker buildx build --platform linux/arm64 -f apps/web/Dockerfile \
  -t registry.example.com/jesuiscoach-web:latest --push .
```

Puis dans Portainer : **Stacks → jesuiscoach → Pull and redeploy**.

---

## Performance attendue sur Pi 5

- BFF : démarre en ~1 s, ~50 Mo RAM au repos
- Web (Caddy) : ~10 Mo RAM, gzip/zstd à la volée
- Redis : ~5 Mo + cache (capé à 256 Mo dans le compose)

Total : **~80 Mo RAM** avant cache. Largement OK sur Pi 4 2GB.
