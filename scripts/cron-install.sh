#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_DIR="$ROOT_DIR/monitoring/cron"
mkdir -p "$CRON_DIR"
touch "$CRON_DIR/monitor.log" "$CRON_DIR/backup.log" "$CRON_DIR/refresh-prune.log" "$CRON_DIR/security-metrics-prune.log"

MONITOR_SCHEDULE="${1:-*/5 * * * *}"
BACKUP_SCHEDULE="${2:-0 */6 * * *}"
ROTATE_OPS_AUTH_SCHEDULE="${3:-0 3 * * 0}"
PRUNE_REFRESH_SCHEDULE="${4:-30 3 * * *}"
PRUNE_SECURITY_METRICS_SCHEDULE="${5:-0 4 * * *}"

MARKER_BEGIN="# BEGIN access-control-system"
MARKER_END="# END access-control-system"

EXISTING="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf '%s\n' "$EXISTING" | awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '
  $0==b {skip=1; next}
  $0==e {skip=0; next}
  !skip {print}
')"

BLOCK=$(cat <<CRON
$MARKER_BEGIN
$MONITOR_SCHEDULE cd "$ROOT_DIR" && "$ROOT_DIR/scripts/cron-run-monitor.sh" >> "$CRON_DIR/monitor.log" 2>&1
$BACKUP_SCHEDULE cd "$ROOT_DIR" && "$ROOT_DIR/scripts/cron-run-backup.sh" >> "$CRON_DIR/backup.log" 2>&1
$ROTATE_OPS_AUTH_SCHEDULE cd "$ROOT_DIR" && "$ROOT_DIR/scripts/cron-run-rotate-ops-auth.sh" >> "$CRON_DIR/monitor.log" 2>&1
$PRUNE_REFRESH_SCHEDULE cd "$ROOT_DIR" && "$ROOT_DIR/scripts/cron-run-prune-refresh-sessions.sh" >> "$CRON_DIR/refresh-prune.log" 2>&1
$PRUNE_SECURITY_METRICS_SCHEDULE cd "$ROOT_DIR" && "$ROOT_DIR/scripts/cron-run-prune-security-metrics-snapshots.sh" >> "$CRON_DIR/security-metrics-prune.log" 2>&1
$MARKER_END
CRON
)

{
  printf '%s\n' "$CLEANED"
  printf '%s\n' "$BLOCK"
} | sed '/^[[:space:]]*$/N;/^\n$/D' | crontab -

echo "[cron] installed"
echo "[cron] monitor: $MONITOR_SCHEDULE"
echo "[cron] backup : $BACKUP_SCHEDULE"
echo "[cron] rotate : $ROTATE_OPS_AUTH_SCHEDULE"
echo "[cron] prune  : $PRUNE_REFRESH_SCHEDULE"
echo "[cron] metrics-prune: $PRUNE_SECURITY_METRICS_SCHEDULE"
"$ROOT_DIR/scripts/audit-log.sh" "cron_install" "ok" "monitor=$MONITOR_SCHEDULE backup=$BACKUP_SCHEDULE rotate=$ROTATE_OPS_AUTH_SCHEDULE prune_refresh=$PRUNE_REFRESH_SCHEDULE prune_security_metrics=$PRUNE_SECURITY_METRICS_SCHEDULE" || true
