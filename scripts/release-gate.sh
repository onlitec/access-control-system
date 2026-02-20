#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_BACKUP="${RUN_BACKUP:-true}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-24}"
SMOKE_AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-security.test@local}"
SMOKE_AUTH_PASSWORD="${SMOKE_AUTH_PASSWORD:-ChangeMe123!}"

echo "[release-gate] starting"
echo "[release-gate] RUN_BACKUP=$RUN_BACKUP BACKUP_MAX_AGE_HOURS=$BACKUP_MAX_AGE_HOURS"

if [[ "$RUN_BACKUP" == "true" ]]; then
  echo "[release-gate] creating backup"
  "$ROOT_DIR/scripts/ops.sh" backup-db
fi

echo "[release-gate] checking backup freshness"
"$ROOT_DIR/scripts/ops.sh" backup-status "$BACKUP_MAX_AGE_HOURS" >/dev/null

echo "[release-gate] health probe"
"$ROOT_DIR/scripts/ops.sh" health >/dev/null

echo "[release-gate] running regression suite"
"$ROOT_DIR/scripts/ops.sh" regression

echo "[release-gate] exporting status json"
"$ROOT_DIR/scripts/ops.sh" status-json >/dev/null

echo "[release-gate] PASSED"
