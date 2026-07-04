#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
MAX_AGE_HOURS="${1:-24}"

LATEST_FILE="$BACKUP_DIR/latest.dump"
if [[ ! -e "$LATEST_FILE" ]]; then
  echo "[backup-status][FAIL] no latest backup found"
  exit 1
fi

# Resolve symlink if needed
if [[ -L "$LATEST_FILE" ]]; then
  TARGET="$(readlink "$LATEST_FILE")"
  LATEST_FILE="$BACKUP_DIR/$TARGET"
fi

if [[ ! -f "$LATEST_FILE" ]]; then
  echo "[backup-status][FAIL] latest backup target missing"
  exit 1
fi

NOW_TS="$(date +%s)"
FILE_TS="$(stat -c %Y "$LATEST_FILE")"
AGE_SEC=$((NOW_TS - FILE_TS))
AGE_HOURS=$((AGE_SEC / 3600))

SIZE="$(du -h "$LATEST_FILE" | awk '{print $1}')"

echo "[backup-status] latest=$(basename "$LATEST_FILE") age_hours=$AGE_HOURS size=$SIZE"

if (( AGE_HOURS > MAX_AGE_HOURS )); then
  echo "[backup-status][FAIL] backup is older than ${MAX_AGE_HOURS}h"
  exit 1
fi

echo "[backup-status][OK] backup freshness within ${MAX_AGE_HOURS}h"
