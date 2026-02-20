#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cmd="${1:-help}"

case "$cmd" in
  build)
    docker compose -f docker-compose.yml build
    ;;
  up)
    docker compose -f docker-compose.yml up -d
    ;;
  down)
    docker compose -f docker-compose.yml down
    ;;
  ps)
    docker compose -f docker-compose.yml ps
    ;;
  logs)
    docker compose -f docker-compose.yml logs -f --tail=150
    ;;
  health)
    docker compose -f docker-compose.yml ps
    curl -k -sS https://127.0.0.1:8443/api/health
    echo
    ;;
  smoke)
    if [[ -n "${2:-}" && -n "${3:-}" ]]; then
      SMOKE_AUTH_EMAIL="$2" SMOKE_AUTH_PASSWORD="$3" "$ROOT_DIR/scripts/smoke-test.sh"
    else
      "$ROOT_DIR/scripts/smoke-test.sh"
    fi
    ;;
  e2e-admin)
    "$ROOT_DIR/scripts/e2e-admin.sh"
    ;;
  backend-contract)
    "$ROOT_DIR/scripts/backend-contract-test.sh" "${2:-https://127.0.0.1:8443}"
    ;;
  regression)
    "$ROOT_DIR/scripts/regression-suite.sh"
    ;;
  release-gate)
    "$ROOT_DIR/scripts/release-gate.sh"
    ;;
  cert)
    "$ROOT_DIR/scripts/gen-self-signed-cert.sh" "${2:-365}"
    ;;
  le-init)
    "$ROOT_DIR/scripts/letsencrypt-init.sh" "${2:-}" "${3:-}" "${4:-false}"
    ;;
  le-renew)
    "$ROOT_DIR/scripts/letsencrypt-renew.sh"
    ;;
  backup-db)
    "$ROOT_DIR/scripts/db-backup.sh"
    ;;
  list-backups)
    "$ROOT_DIR/scripts/db-list-backups.sh"
    ;;
  backup-status)
    "$ROOT_DIR/scripts/db-backup-status.sh" "${2:-24}"
    ;;
  prune-refresh-sessions)
    "$ROOT_DIR/scripts/prune-refresh-sessions.sh"
    ;;
  collect-security-metrics-snapshot)
    "$ROOT_DIR/scripts/collect-security-metrics-snapshot.sh" "${2:-}" "${3:-}"
    ;;
  prune-security-metrics-snapshots)
    "$ROOT_DIR/scripts/prune-security-metrics-snapshots.sh" "${2:-}"
    ;;
  restore-db)
    "$ROOT_DIR/scripts/db-restore.sh" "${2:-}" "${3:-}"
    ;;
  backup-verify)
    "$ROOT_DIR/scripts/backup-verify.sh"
    ;;
  monitor-once)
    "$ROOT_DIR/scripts/monitor-once.sh"
    ;;
  monitor-loop)
    "$ROOT_DIR/scripts/monitor-loop.sh" "${2:-5}"
    ;;
  status-json)
    "$ROOT_DIR/scripts/export-status-json.sh"
    cat "$ROOT_DIR/monitoring/status.json"
    ;;
  set-ops-auth)
    "$ROOT_DIR/scripts/set-ops-auth.sh" "${2:-}" "${3:-}"
    ;;
  clear-ops-auth)
    "$ROOT_DIR/scripts/clear-ops-auth.sh"
    ;;
  rotate-ops-auth)
    "$ROOT_DIR/scripts/rotate-ops-auth.sh" "${2:-opsadmin}" "${3:-24}"
    ;;
  cron-install)
    "$ROOT_DIR/scripts/cron-install.sh" "${2:-*/5 * * * *}" "${3:-0 */6 * * *}" "${4:-0 3 * * 0}" "${5:-30 3 * * *}" "${6:-0 4 * * *}"
    ;;
  cron-uninstall)
    "$ROOT_DIR/scripts/cron-uninstall.sh"
    ;;
  cron-status)
    crontab -l 2>/dev/null || true
    ;;
  bootstrap-admin)
    if [[ -z "${2:-}" || -z "${3:-}" ]]; then
      echo "Usage: $(basename "$0") bootstrap-admin <email> <password> [name] [role]"
      exit 1
    fi
    ADMIN_EMAIL="$2" \
    ADMIN_PASSWORD="$3" \
    ADMIN_NAME="${4:-Platform Admin}" \
    ADMIN_ROLE="${5:-ADMIN}" \
      npm run --workspace backend-api bootstrap:admin
    ;;
  *)
    cat <<USAGE
Usage: $(basename "$0") <command>
  build   Build images
  up      Start stack
  down    Stop stack
  ps      Show service status
  logs    Follow logs
  health  Quick health probe
  smoke   Run smoke tests (optional: smoke <email> <password> for auth flow)
  e2e-admin Run Playwright E2E suite for frontend-admin/security flows
  backend-contract Run backend API contract suite (service-providers/towers/dashboard)
  regression Run coverage + smoke + backend contract + frontend-admin E2E suite
  release-gate Run backup/health/regression gate before release
  cert    Regenerate self-signed TLS cert (optional: days)
  le-init Initialize Let's Encrypt cert + switch nginx to 80/443 mode
  le-renew Renew Let's Encrypt certs and reload nginx
  backup-db Create PostgreSQL backup (.dump) under backups/
  list-backups List available backups
  backup-status Check latest backup freshness (hours, default 24)
  backup-verify Create backup, mutate DB, restore backup and verify data recovery
  prune-refresh-sessions Delete expired/revoked refresh sessions
  collect-security-metrics-snapshot Capture one security metrics snapshot [window_hours] [top_n]
  prune-security-metrics-snapshots Prune old security metrics snapshots [retention_days]
  restore-db Restore PostgreSQL from backup (requires --yes)
  monitor-once Run smoke + backup freshness checks and alert on failure
  monitor-loop Run monitor-once continuously (default every 5 minutes)
  status-json Generate and print monitoring status.json
  set-ops-auth Set Basic Auth user/pass for /ops/status.json
  clear-ops-auth Clear Basic Auth credentials for /ops/status.json
  rotate-ops-auth Rotate Ops Basic Auth and store latest credentials file
  cron-install Install cron jobs [monitor_schedule] [backup_schedule] [rotate_schedule] [prune_refresh_schedule] [prune_security_metrics_schedule]
  cron-uninstall Remove cron jobs managed by this project
  cron-status Show current user crontab
  bootstrap-admin Create/update initial backend admin (email/password)
USAGE
    ;;
esac
