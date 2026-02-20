#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
CHANNEL="${ALERT_CHANNEL:-access-control-system}"
MESSAGE="${1:-[ci-alert] unspecified failure}"

if [[ -z "$WEBHOOK_URL" ]]; then
  echo "[ci-alert][SKIP] ALERT_WEBHOOK_URL not set"
  exit 0
fi

PAYLOAD="$(node -e "const [channel, text] = process.argv.slice(1); process.stdout.write(JSON.stringify({ channel, text }));" "$CHANNEL" "$MESSAGE")"

curl -sS -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" >/dev/null

echo "[ci-alert][OK] sent"
