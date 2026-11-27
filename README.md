# Je suis coach

Application de coaching vélo pour un petit groupe d'amis : forme de chaque athlète (fitness, fatigue, forme), fil des sorties, calendrier, et séances envoyées directement sur les montres Garmin. Mobile first, installable sur l'écran d'accueil (PWA), design inspiré d'iOS.

Les données passent par [Intervals.icu](https://intervals.icu) : chaque athlète y connecte Garmin, puis se connecte à l'app avec son compte Intervals.icu (OAuth).

## Démarrer en local (mode démo)

```bash
npm install
npm run db:up                             # Postgres (5433) + Redis (6380) en Docker
cp apps/bff/.env.example apps/bff/.env   # DEMO_MODE=true par défaut
cp apps/web/.env.example apps/web/.env
npm run dev
```

Ouvre http://localhost:5173 puis « Démo coach » (ou « Démo athlète »). Le BFF crée les tables lui-même au démarrage.

## Structure

- `apps/web` — React 19, Vite, composants iOS (`src/components/ios`), PWA (`public/sw.js`)
- `apps/bff` — Fastify 5, Postgres, Redis, client Intervals.icu, OAuth, sessions, notifications push
- `apps/bff/migrations` — schéma SQL, appliqué au démarrage du BFF
- [`DEPLOY.md`](./DEPLOY.md) — Raspberry Pi via Portainer (Postgres et sauvegardes inclus), app OAuth Intervals.icu
