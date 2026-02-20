#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MON_DIR="$ROOT_DIR/monitoring"
OUT_FILE="$MON_DIR/status.json"
STATUS_FILE="$MON_DIR/last-status.txt"
BACKUP_DIR="$ROOT_DIR/backups"
ENV_FILE="$ROOT_DIR/.env"

mkdir -p "$MON_DIR"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

NOW_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HOSTNAME_VAL="$(hostname)"

LAST_CHECK_AT=""
LAST_CHECK_RESULT="unknown"
if [[ -f "$STATUS_FILE" ]]; then
  LAST_CHECK_AT="$(awk '{print $1}' "$STATUS_FILE")"
  LAST_CHECK_RESULT="$(awk '{print $2}' "$STATUS_FILE" | tr '[:upper:]' '[:lower:]')"
fi

API_HEALTH_CODE="0"
API_HEALTH_LATENCY_SEC="null"
if API_HEALTH_LATENCY_SEC=$(curl -k -s -o /dev/null -w '%{time_total}' https://127.0.0.1:8443/api/health); then
  API_HEALTH_CODE="200"
fi

LATEST_BACKUP=""
BACKUP_SIZE_BYTES="0"
BACKUP_AGE_HOURS="null"
if [[ -L "$BACKUP_DIR/latest.dump" || -f "$BACKUP_DIR/latest.dump" ]]; then
  LATEST_PATH="$BACKUP_DIR/latest.dump"
  if [[ -L "$LATEST_PATH" ]]; then
    TARGET="$(readlink "$LATEST_PATH")"
    LATEST_PATH="$BACKUP_DIR/$TARGET"
    LATEST_BACKUP="$TARGET"
  else
    LATEST_BACKUP="$(basename "$LATEST_PATH")"
  fi

  if [[ -f "$LATEST_PATH" ]]; then
    BACKUP_SIZE_BYTES="$(stat -c %s "$LATEST_PATH")"
    NOW_TS="$(date +%s)"
    FILE_TS="$(stat -c %Y "$LATEST_PATH")"
    BACKUP_AGE_HOURS="$(( (NOW_TS - FILE_TS) / 3600 ))"
  fi
fi

SEC_METRICS_LATEST_AT="null"
SEC_METRICS_AGE_MINUTES="null"
SEC_METRICS_LOGIN_ATTEMPTS="null"
SEC_METRICS_LOGIN_FAILED_ATTEMPTS="null"
SEC_METRICS_FAILURE_RATE="null"

if [[ -n "${DB_USER:-}" && -n "${DB_PASSWORD:-}" && -n "${DB_NAME:-}" ]]; then
  METRICS_ROW="$(docker exec -e PGPASSWORD="$DB_PASSWORD" calabasas-db \
    psql -U "$DB_USER" -d "$DB_NAME" -At -F '|' \
    -c "SELECT to_char(generated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), login_attempts, login_failed_attempts, login_failure_rate FROM security_metric_snapshots ORDER BY generated_at DESC LIMIT 1;" 2>/dev/null || true)"

  if [[ -n "$METRICS_ROW" ]]; then
    IFS='|' read -r RAW_GENERATED_AT RAW_ATTEMPTS RAW_FAILED RAW_FAILURE_RATE <<< "$METRICS_ROW"
    if [[ -n "${RAW_GENERATED_AT:-}" ]]; then
      SEC_METRICS_LATEST_AT="\"$RAW_GENERATED_AT\""
      SEC_METRICS_LOGIN_ATTEMPTS="${RAW_ATTEMPTS:-null}"
      SEC_METRICS_LOGIN_FAILED_ATTEMPTS="${RAW_FAILED:-null}"
      SEC_METRICS_FAILURE_RATE="${RAW_FAILURE_RATE:-null}"

      NOW_TS="$(date +%s)"
      GENERATED_TS="$(date -d "$RAW_GENERATED_AT" +%s 2>/dev/null || echo '')"
      if [[ -n "$GENERATED_TS" ]]; then
        DELTA_SECONDS="$(( NOW_TS - GENERATED_TS ))"
        if [[ "$DELTA_SECONDS" -lt 0 ]]; then
          DELTA_SECONDS=0
        fi
        SEC_METRICS_AGE_MINUTES="$(( DELTA_SECONDS / 60 ))"
      fi
    fi
  fi
fi

containers=(calabasas-proxy calabasas-api calabasas-db calabasas-painel calabasas-login calabasas-admin)
services_json=""
all_healthy="true"

for c in "${containers[@]}"; do
  state="missing"
  health="missing"

  if docker inspect "$c" >/dev/null 2>&1; then
    state="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo unknown)"
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$c" 2>/dev/null || echo unknown)"
  fi

  if [[ "$state" != "running" ]]; then
    all_healthy="false"
  fi

  if [[ "$health" != "healthy" && "$health" != "n/a" ]]; then
    all_healthy="false"
  fi

  if [[ -n "$services_json" ]]; then
    services_json+=" , "
  fi

  services_json+=$(printf '{"name":"%s","state":"%s","health":"%s"}' "$c" "$state" "$health")
done

overall="ok"
if [[ "$LAST_CHECK_RESULT" == "fail" || "$API_HEALTH_CODE" != "200" || "$all_healthy" != "true" ]]; then
  overall="fail"
fi

cat > "$OUT_FILE" <<JSON
{
  "timestamp_utc": "$NOW_UTC",
  "host": "$HOSTNAME_VAL",
  "overall_status": "$overall",
  "last_monitor_check": {
    "timestamp_utc": "$LAST_CHECK_AT",
    "result": "$LAST_CHECK_RESULT"
  },
  "api_health": {
    "http_code": $API_HEALTH_CODE,
    "latency_seconds": $API_HEALTH_LATENCY_SEC
  },
  "backup": {
    "latest_file": "$LATEST_BACKUP",
    "size_bytes": $BACKUP_SIZE_BYTES,
    "age_hours": $BACKUP_AGE_HOURS
  },
  "security_metrics": {
    "latest_snapshot_at": $SEC_METRICS_LATEST_AT,
    "age_minutes": $SEC_METRICS_AGE_MINUTES,
    "login_attempts": $SEC_METRICS_LOGIN_ATTEMPTS,
    "login_failed_attempts": $SEC_METRICS_LOGIN_FAILED_ATTEMPTS,
    "login_failure_rate": $SEC_METRICS_FAILURE_RATE
  },
  "services": [ $services_json ]
}
JSON

echo "[status-json] updated: $OUT_FILE"
