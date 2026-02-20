#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RETENTION_DAYS="${1:-}"
if [[ -n "$RETENTION_DAYS" ]]; then
  OUT="$(docker exec calabasas-api sh -lc "npm run prune:security-metrics-snapshots -- '$RETENTION_DAYS'")"
else
  OUT="$(docker exec calabasas-api sh -lc 'npm run prune:security-metrics-snapshots')"
fi

echo "$OUT"
"$ROOT_DIR/scripts/audit-log.sh" "security_metrics_snapshots_prune" "ok" "$(echo "$OUT" | tr '\n' ' ' | cut -c1-800)" || true
