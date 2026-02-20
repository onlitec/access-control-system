#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docker run --rm \
  -v "$ROOT_DIR/letsencrypt:/etc/letsencrypt" \
  -v "$ROOT_DIR/certbot/www:/var/www/certbot" \
  certbot/certbot:latest renew --webroot -w /var/www/certbot

# Reload nginx after renew
if docker ps --format '{{.Names}}' | rg -q '^calabasas-proxy$'; then
  docker restart calabasas-proxy >/dev/null
fi

echo "[letsencrypt] renew completed"
