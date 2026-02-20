#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTH_DIR="$ROOT_DIR/auth"
CREDS_FILE="$AUTH_DIR/ops-current-credentials.txt"

USER_NAME="${1:-opsadmin}"
PASS_LENGTH="${2:-24}"

if ! [[ "$PASS_LENGTH" =~ ^[0-9]+$ ]] || [[ "$PASS_LENGTH" -lt 16 ]]; then
  echo "Usage: $(basename "$0") [user] [password_length>=16]"
  exit 1
fi

mkdir -p "$AUTH_DIR"

NEW_PASS="$(openssl rand -base64 64 | tr -dc 'A-Za-z0-9@#%+=._-' | head -c "$PASS_LENGTH")"
if [[ ${#NEW_PASS} -lt 16 ]]; then
  echo "[rotate-ops-auth][FAIL] generated password too short"
  exit 1
fi

"$ROOT_DIR/scripts/set-ops-auth.sh" "$USER_NAME" "$NEW_PASS" >/dev/null

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "timestamp_utc=$TS"
  echo "username=$USER_NAME"
  echo "password=$NEW_PASS"
} > "$CREDS_FILE"
chmod 600 "$CREDS_FILE"

"$ROOT_DIR/scripts/audit-log.sh" "ops_auth_rotate" "ok" "user=$USER_NAME"
"$ROOT_DIR/scripts/send-alert.sh" "[$TS] Ops auth rotated for user '$USER_NAME'. New credentials stored at $CREDS_FILE" || true

echo "[rotate-ops-auth] done (user=$USER_NAME, length=${#NEW_PASS})"
