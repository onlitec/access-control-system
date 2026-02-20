#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/monitoring"
mkdir -p "$LOG_DIR"

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STATUS_FILE="$LOG_DIR/last-status.txt"

run_check() {
  local name="$1"
  shift
  if "$@"; then
    echo "[monitor][OK] $name"
    return 0
  fi
  echo "[monitor][FAIL] $name"
  return 1
}

FAIL=0

run_check "smoke" "$ROOT_DIR/scripts/smoke-test.sh" || FAIL=1
run_check "backup-freshness-24h" "$ROOT_DIR/scripts/db-backup-status.sh" 24 || FAIL=1

if [[ "$FAIL" -eq 0 ]]; then
  echo "$TS OK" > "$STATUS_FILE"
  "$ROOT_DIR/scripts/export-status-json.sh" || true
  echo "[monitor] all checks passed"
  exit 0
fi

echo "$TS FAIL" > "$STATUS_FILE"
"$ROOT_DIR/scripts/export-status-json.sh" || true
ALERT_MSG="[${TS}] ALERT: health checks failed on access-control-system host $(hostname)."
"$ROOT_DIR/scripts/send-alert.sh" "$ALERT_MSG" || true
exit 1
