# =============================================================================
# BFF — Dockerfile cross-platform
# =============================================================================
# Build:   linux/amd64 (CI / machine de dev)
# Runtime: linux/arm64 (Raspberry Pi 4/5 64-bit)
#
# Toutes les deps du BFF sont en JS pur (pas de modules natifs : ioredis,
# axios, fastify, pg, dotenv). Donc le node_modules construit
# sur amd64 fonctionne tel quel sur arm64 — aucun rebuild nécessaire.
#
# Build (depuis la racine du repo) :
#   docker buildx build \
#     --platform linux/arm64 \
#     -f apps/bff/Dockerfile \
#     -t jesuiscoach-bff:latest \
#     --load .
#
# Pour pousser sur registry :
#   docker buildx build --platform linux/arm64 -f apps/bff/Dockerfile \
#     -t ghcr.io/<user>/jesuiscoach-bff:latest --push .
# =============================================================================

FROM --platform=linux/amd64 node:22-alpine AS build
WORKDIR /repo

# 1. Manifests d'abord pour profiter du cache Docker quand seules les sources changent
COPY package.json package-lock.json ./
COPY apps/bff/package.json ./apps/bff/

# 2. Install des deps du BFF uniquement (skip web → build plus rapide)
RUN npm ci --workspace @jesuiscoach/bff --include-workspace-root

# 3. Sources + compilation TS
COPY apps/bff/tsconfig.json ./apps/bff/
COPY apps/bff/src ./apps/bff/src
RUN npm run build --workspace @jesuiscoach/bff

# 4. Élague les devDeps (tsx, pino-pretty, @types/*, typescript) pour ne garder
#    que le strict runtime → image finale beaucoup plus légère.
RUN npm prune --workspace @jesuiscoach/bff --omit=dev

# -----------------------------------------------------------------------------
FROM --platform=linux/arm64 node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# wget pour le HEALTHCHECK (déjà inclus dans alpine via busybox)
COPY --from=build /repo/apps/bff/package.json ./
COPY --from=build /repo/apps/bff/dist ./dist
# Migrations SQL appliquées au démarrage (src/db/migrate.ts → /app/migrations)
COPY apps/bff/migrations ./migrations
COPY --from=build /repo/node_modules ./node_modules

# Utilisateur non-root pour l'exécution
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
