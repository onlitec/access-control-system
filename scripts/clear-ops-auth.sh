#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTH_FILE="$ROOT_DIR/auth/.htpasswd"

mkdir -p "$(dirname "$AUTH_FILE")"
: > "$AUTH_FILE"
chmod 644 "$AUTH_FILE"

docker compose -f "$ROOT_DIR/docker-compose.yml" up -d nginx >/dev/null
"$ROOT_DIR/scripts/audit-log.sh" "ops_auth_clear" "ok" "" || true

echo "[ops-auth] credentials cleared"
