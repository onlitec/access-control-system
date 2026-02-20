# Contributing

## Local baseline

Use Node version from `.nvmrc`:
- `nvm use`

Run full regression before opening PR:
- `./scripts/ops.sh regression`

## Branch protection (recommended)

For `main`/`master`, require:
1. Status check: `Security Regression / security-regression`
2. At least 1 approving review
3. Dismiss stale reviews when new commits are pushed
4. Require branch to be up to date before merging

## Expected CI checks

Workflow `.github/workflows/security-regression.yml` validates:
1. Coverage gate (`frontend-admin`)
2. Smoke tests
3. Playwright E2E
4. Build checks
