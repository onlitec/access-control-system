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

INPUT="${1:-$BACKUP_DIR/latest.dump}"
CONFIRM="${2:-}"

if [[ ! -f "$INPUT" ]]; then
  echo "[restore][FAIL] backup not found: $INPUT"
  exit 1
fi

if [[ "$CONFIRM" != "--yes" ]]; then
  echo "[restore][ABORT] destructive operation blocked."
  echo "Usage: $(basename "$0") <backup-file> --yes"
  echo "Example: $(basename "$0") $BACKUP_DIR/latest.dump --yes"
  exit 1
fi

echo "[restore] target db=$DB_NAME file=$INPUT"
echo "[restore] terminating active sessions"
docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null

echo "[restore] recreating database"
docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" >/dev/null
docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"${DB_NAME}\";" >/dev/null

echo "[restore] restoring dump"
cat "$INPUT" | docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" \
  pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges

echo "[restore] done"
