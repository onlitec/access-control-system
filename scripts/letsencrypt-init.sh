#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOMAIN="${1:-}"
EMAIL="${2:-}"
STAGING="${3:-false}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $(basename "$0") <domain> <email> [staging:true|false]"
  exit 1
fi

mkdir -p letsencrypt certbot/www

# 1) Bootstrap HTTP-only config to allow ACME challenge
sed "s/__DOMAIN__/${DOMAIN}/g" nginx.letsencrypt.bootstrap.conf.template > nginx.letsencrypt.conf

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.letsencrypt.yml)

"${COMPOSE[@]}" up -d nginx

# 2) Issue certificate
CERTBOT_ARGS=(certonly --webroot -w /var/www/certbot -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email --non-interactive)
if [[ "$STAGING" == "true" ]]; then
  CERTBOT_ARGS+=(--staging)
fi

docker run --rm \
  -v "$ROOT_DIR/letsencrypt:/etc/letsencrypt" \
  -v "$ROOT_DIR/certbot/www:/var/www/certbot" \
  certbot/certbot:latest "${CERTBOT_ARGS[@]}"

# Ensure certificate files exist before switching nginx to TLS config
if [[ ! -f "$ROOT_DIR/letsencrypt/live/$DOMAIN/fullchain.pem" || ! -f "$ROOT_DIR/letsencrypt/live/$DOMAIN/privkey.pem" ]]; then
  echo "[letsencrypt][FAIL] certificate files not found for $DOMAIN"
  exit 1
fi

# 3) Switch to full HTTPS config and enable renew service
sed "s/__DOMAIN__/${DOMAIN}/g" nginx.letsencrypt.conf.template > nginx.letsencrypt.conf
"${COMPOSE[@]}" up -d nginx certbot

echo "[letsencrypt] certificate issued for $DOMAIN"
echo "[letsencrypt] nginx switched to HTTPS on ports 80/443"
