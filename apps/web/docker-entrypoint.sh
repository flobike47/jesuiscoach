#!/bin/sh
set -eu

# Substitue les placeholders __XXX__ dans les fichiers servis par Caddy
# (/srv/index.html et /srv/config.js) à partir des variables d'env du
# conteneur (passées par Portainer au déploiement).
#
# Re-applique la substitution à chaque boot en repartant du template vierge
# (/srv.template/), pour que changer une env var puis restart le conteneur
# suffise — pas besoin de recreate.
#
# Variables (avec fallback sur le préfixe VITE_* pour rétro-compat) :
#   BASE_PATH            (défaut "/")        — sous-chemin de l'app (ex: /jesuiscoach/)
#   BFF_URL              — URL publique du BFF       — OU VITE_BFF_URL

TEMPLATE=/srv.template
TARGET=/srv

if [ ! -d "$TEMPLATE" ]; then
  echo "[entrypoint] $TEMPLATE introuvable, abort"
  exit 1
fi

# 1. Restaure une version vierge à partir du template
#    (on ne touche pas aux fichiers d'assets versionnés, juste à index.html et config.js)
cp -f "$TEMPLATE/index.html" "$TARGET/index.html"
cp -f "$TEMPLATE/config.js"  "$TARGET/config.js"

# 2. Normalise BASE_PATH : toujours en /foo/ (slash début + fin), ou / racine
RAW_BASE="${BASE_PATH:-/}"
case "$RAW_BASE" in
  /*) ;;
  *)  RAW_BASE="/$RAW_BASE" ;;
esac
case "$RAW_BASE" in
  */) EFFECTIVE_BASE_PATH="$RAW_BASE" ;;
  *)  EFFECTIVE_BASE_PATH="$RAW_BASE/" ;;
esac

EFFECTIVE_BFF_URL="${BFF_URL:-${VITE_BFF_URL:-}}"

# 3. Substitue (délimiteur # car les valeurs contiennent / et =)
sed -i \
  -e "s#__BASE_PATH__#${EFFECTIVE_BASE_PATH}#g" \
  "$TARGET/index.html"

sed -i \
  -e "s#__BASE_PATH__#${EFFECTIVE_BASE_PATH}#g" \
  -e "s#__BFF_URL__#${EFFECTIVE_BFF_URL}#g" \
  "$TARGET/config.js"

echo "[entrypoint] runtime config :"
echo "  BASE_PATH=${EFFECTIVE_BASE_PATH}"
echo "  BFF_URL=${EFFECTIVE_BFF_URL:-<empty>}"

if [ -z "${EFFECTIVE_BFF_URL}" ]; then
  echo "[entrypoint] ⚠️  BFF_URL est vide. Le frontend va échouer."
  echo "[entrypoint]    Configure BFF_URL dans Portainer."
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
