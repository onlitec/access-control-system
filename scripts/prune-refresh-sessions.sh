#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT="$(docker exec calabasas-api sh -lc 'npm run prune:refresh-sessions')"
echo "$OUT"
"$ROOT_DIR/scripts/audit-log.sh" "refresh_sessions_prune" "ok" "$(echo "$OUT" | tr '\n' ' ' | cut -c1-800)" || true
