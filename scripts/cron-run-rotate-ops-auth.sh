#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="/tmp/access-control-ops-auth-rotate.lock"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK_DIR"' EXIT

"$ROOT_DIR/scripts/rotate-ops-auth.sh" "${1:-opsadmin}" "${2:-24}"
