#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
BACKUP_DIR="$ROOT_DIR/backups"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-calabasas_db}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_CONTAINER="${DB_CONTAINER:-calabasas-db}"

mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/${DB_NAME}_${TS}.dump"
LATEST_LINK="$BACKUP_DIR/latest.dump"

echo "[backup] creating: $OUT_FILE"
docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$OUT_FILE"

ln -sfn "$(basename "$OUT_FILE")" "$LATEST_LINK"

SIZE="$(du -h "$OUT_FILE" | awk '{print $1}')"
echo "[backup] done: $OUT_FILE ($SIZE)"

echo "[backup] pruning old backups (keep 15)"
ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | tail -n +16 | xargs -r rm -f

echo "[backup] latest -> $(readlink "$LATEST_LINK")"
