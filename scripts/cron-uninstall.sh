#!/usr/bin/env bash
set -euo pipefail

MARKER_BEGIN="# BEGIN access-control-system"
MARKER_END="# END access-control-system"

EXISTING="$(crontab -l 2>/dev/null || true)"

CLEANED="$(printf '%s\n' "$EXISTING" | awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '
  $0==b {skip=1; next}
  $0==e {skip=0; next}
  !skip {print}
')"

printf '%s\n' "$CLEANED" | sed '/^[[:space:]]*$/d' | crontab -

"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/audit-log.sh" "cron_uninstall" "ok" "" || true

echo "[cron] uninstalled access-control-system jobs"
