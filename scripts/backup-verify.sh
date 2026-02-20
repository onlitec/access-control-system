#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-calabasas_db}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_CONTAINER="${DB_CONTAINER:-calabasas-db}"
VERIFY_EMAIL="${BACKUP_VERIFY_EMAIL:-backup.verify@local}"
VERIFY_NAME="${BACKUP_VERIFY_NAME:-Backup Verify}"
VERIFY_PASSWORD="${BACKUP_VERIFY_PASSWORD:-not-used-for-login}"
VERIFY_ROLE="${BACKUP_VERIFY_ROLE:-ADMIN}"
VERIFY_ID="${BACKUP_VERIFY_ID:-$(cat /proc/sys/kernel/random/uuid)}"

echo "[backup-verify] ensuring required services"
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres backend-api >/dev/null

echo "[backup-verify] waiting for database health"
timeout 180 bash -c "until [ \"\$(docker inspect -f '{{.State.Health.Status}}' \"$DB_CONTAINER\" 2>/dev/null)\" = 'healthy' ]; do sleep 2; done"

echo "[backup-verify] waiting for users table"
timeout 180 bash -c "until docker exec -e PGPASSWORD=\"$DB_PASSWORD\" \"$DB_CONTAINER\" psql -U \"$DB_USER\" -d \"$DB_NAME\" -At -c \"SELECT to_regclass('public.users')\" | grep -q users; do sleep 2; done"

echo "[backup-verify] seeding deterministic verification record"
docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c \
  "INSERT INTO users (id, email, password, name, role) VALUES ('$VERIFY_ID', '$VERIFY_EMAIL', '$VERIFY_PASSWORD', '$VERIFY_NAME', '$VERIFY_ROLE') ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, name = EXCLUDED.name, role = EXCLUDED.role;" >/dev/null

BEFORE_COUNT="$(docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "SELECT count(*) FROM users WHERE email='$VERIFY_EMAIL';" | tr -d '[:space:]')"
echo "[backup-verify] count before backup=$BEFORE_COUNT"
if [[ "$BEFORE_COUNT" != "1" ]]; then
  echo "[backup-verify][FAIL] expected verification record count=1 before backup"
  exit 1
fi

echo "[backup-verify] creating fresh backup"
"$ROOT_DIR/scripts/ops.sh" backup-db >/dev/null

echo "[backup-verify] mutating DB state (delete verification record)"
docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c \
  "DELETE FROM users WHERE email='$VERIFY_EMAIL';" >/dev/null

MUTATED_COUNT="$(docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "SELECT count(*) FROM users WHERE email='$VERIFY_EMAIL';" | tr -d '[:space:]')"
echo "[backup-verify] count after mutation=$MUTATED_COUNT"
if [[ "$MUTATED_COUNT" != "0" ]]; then
  echo "[backup-verify][FAIL] expected verification record count=0 after mutation"
  exit 1
fi

echo "[backup-verify] restoring latest backup"
"$ROOT_DIR/scripts/ops.sh" restore-db "$ROOT_DIR/backups/latest.dump" --yes >/dev/null

RESTORED_COUNT="$(docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "SELECT count(*) FROM users WHERE email='$VERIFY_EMAIL';" | tr -d '[:space:]')"
echo "[backup-verify] count after restore=$RESTORED_COUNT"
if [[ "$RESTORED_COUNT" != "1" ]]; then
  echo "[backup-verify][FAIL] expected verification record count=1 after restore"
  exit 1
fi

LATEST_PATH="$ROOT_DIR/backups/latest.dump"
if [[ ! -e "$LATEST_PATH" ]]; then
  echo "[backup-verify][FAIL] latest backup link missing"
  exit 1
fi

if [[ -L "$LATEST_PATH" ]]; then
  TARGET="$(readlink "$LATEST_PATH")"
  LATEST_PATH="$ROOT_DIR/backups/$TARGET"
fi

SIZE="$(du -h "$LATEST_PATH" | awk '{print $1}')"
SHA256="$(sha256sum "$LATEST_PATH" | awk '{print $1}')"
echo "[backup-verify] latest=$(basename "$LATEST_PATH") size=$SIZE sha256=$SHA256"
echo "[backup-verify][OK] backup/restore verification passed"
