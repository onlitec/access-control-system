#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WINDOW_HOURS="${1:-}"
TOP_N="${2:-}"

if [[ -n "$WINDOW_HOURS" && -n "$TOP_N" ]]; then
  OUT="$(docker exec calabasas-api sh -lc "npm run collect:security-metrics-snapshot -- '$WINDOW_HOURS' '$TOP_N'")"
elif [[ -n "$WINDOW_HOURS" ]]; then
  OUT="$(docker exec calabasas-api sh -lc "npm run collect:security-metrics-snapshot -- '$WINDOW_HOURS'")"
else
  OUT="$(docker exec calabasas-api sh -lc 'npm run collect:security-metrics-snapshot')"
fi

echo "$OUT"
"$ROOT_DIR/scripts/audit-log.sh" "security_metrics_snapshot_collect" "ok" "$(echo "$OUT" | tr '\n' ' ' | cut -c1-800)" || true
