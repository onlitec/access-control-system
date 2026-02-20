#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SMOKE_AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-security.test@local}"
SMOKE_AUTH_PASSWORD="${SMOKE_AUTH_PASSWORD:-ChangeMe123!}"

echo "[regression] 1/4 frontend-admin coverage gate"
npm run --workspace frontend-admin test:coverage

echo "[regression] 2/4 smoke tests"
./scripts/ops.sh smoke "$SMOKE_AUTH_EMAIL" "$SMOKE_AUTH_PASSWORD"

echo "[regression] 3/4 backend API contract tests"
./scripts/ops.sh backend-contract

echo "[regression] 4/4 admin security e2e"
./scripts/ops.sh e2e-admin

echo "[regression] all checks passed"
