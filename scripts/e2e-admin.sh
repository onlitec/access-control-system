#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend-admin"

E2E_BASE_URL="${E2E_BASE_URL:-https://localhost:8443}"
E2E_API_BASE="${E2E_API_BASE:-https://localhost:8443/api}"
E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-security.test@local}"
E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-ChangeMe123!}"

if ! command -v npx >/dev/null 2>&1; then
  echo "[e2e-admin] npx is required"
  exit 1
fi

echo "[e2e-admin] running with:"
echo "  E2E_BASE_URL=$E2E_BASE_URL"
echo "  E2E_API_BASE=$E2E_API_BASE"
echo "  E2E_ADMIN_EMAIL=$E2E_ADMIN_EMAIL"

E2E_BASE_URL="$E2E_BASE_URL" \
E2E_API_BASE="$E2E_API_BASE" \
E2E_ADMIN_EMAIL="$E2E_ADMIN_EMAIL" \
E2E_ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD" \
  npm run e2e
