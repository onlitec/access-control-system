#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_MINUTES="${1:-5}"

if ! [[ "$INTERVAL_MINUTES" =~ ^[0-9]+$ ]] || [[ "$INTERVAL_MINUTES" -lt 1 ]]; then
  echo "Usage: $(basename "$0") [interval_minutes>=1]"
  exit 1
fi

while true; do
  "$ROOT_DIR/scripts/monitor-once.sh" || true
  sleep "$((INTERVAL_MINUTES * 60))"
done
