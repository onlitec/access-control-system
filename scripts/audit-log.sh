#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIT_FILE="$ROOT_DIR/monitoring/audit.log"
mkdir -p "$(dirname "$AUDIT_FILE")"

ACTION="${1:-unknown_action}"
STATUS="${2:-ok}"
DETAILS="${3:-}"

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
USER_NAME="${USER:-unknown}"
HOST_NAME="$(hostname)"
DETAILS_ESCAPED="$(printf '%s' "$DETAILS" | sed 's/\\/\\\\/g; s/\"/\\"/g')"

printf '{"timestamp_utc":"%s","host":"%s","user":"%s","action":"%s","status":"%s","details":"%s"}\n' \
  "$TS" "$HOST_NAME" "$USER_NAME" "$ACTION" "$STATUS" "$DETAILS_ESCAPED" >> "$AUDIT_FILE"

echo "[audit] $ACTION $STATUS"
