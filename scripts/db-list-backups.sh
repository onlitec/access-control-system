#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "[backup] no backup directory: $BACKUP_DIR"
  exit 0
fi

ls -lah "$BACKUP_DIR" | sed -n '1,200p'
