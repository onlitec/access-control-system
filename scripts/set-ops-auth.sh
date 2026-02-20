#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTH_FILE="$ROOT_DIR/auth/.htpasswd"
USER="${1:-}"
PASS="${2:-}"

if [[ -z "$USER" || -z "$PASS" ]]; then
  echo "Usage: $(basename "$0") <username> <password>"
  exit 1
fi

mkdir -p "$(dirname "$AUTH_FILE")"
HASH="$(openssl passwd -apr1 "$PASS")"

# Remove existing user entry
TMP_FILE="$(mktemp)"
if [[ -f "$AUTH_FILE" ]]; then
  grep -v "^${USER}:" "$AUTH_FILE" > "$TMP_FILE" || true
fi
printf '%s:%s\n' "$USER" "$HASH" >> "$TMP_FILE"
mv "$TMP_FILE" "$AUTH_FILE"
chmod 644 "$AUTH_FILE"

docker compose -f "$ROOT_DIR/docker-compose.yml" up -d nginx >/dev/null
"$ROOT_DIR/scripts/audit-log.sh" "ops_auth_set" "ok" "user=$USER" || true

echo "[ops-auth] user set: $USER"
