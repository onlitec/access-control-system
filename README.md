# Access Control System

[![Security Regression](https://github.com/YOUR_ORG/YOUR_REPO/actions/workflows/security-regression.yml/badge.svg)](https://github.com/YOUR_ORG/YOUR_REPO/actions/workflows/security-regression.yml)

Stack com backend API, frontends (admin/painel/login), PostgreSQL e Nginx reverse proxy.

## Quick Ops

- Subir stack: `./scripts/ops.sh up`
- Smoke test: `./scripts/ops.sh smoke security.test@local 'ChangeMe123!'`
- Contrato backend: `./scripts/ops.sh backend-contract`
- Snapshot de métricas de segurança: `./scripts/ops.sh collect-security-metrics-snapshot`
- E2E segurança: `./scripts/ops.sh e2e-admin`
- Regressão completa: `./scripts/ops.sh regression`
- Gate de release: `./scripts/ops.sh release-gate`

## CI

Workflow principal:
- `.github/workflows/security-regression.yml`
- Runtime Node padronizado por `.nvmrc`

Workflow de backup verification:
- `.github/workflows/backup-verify.yml`

Etapas:
1. Instala dependências.
2. Build + start via Docker Compose.
3. Bootstrap do usuário admin de teste.
4. Regressão local padronizada (`coverage + smoke + backend-contract + e2e`).
5. Build checks finais.

Artefatos:
- `coverage-artifacts` (lcov e arquivos de cobertura).
- `playwright-artifacts` (report/traces/screenshots/videos).
- `compose-logs`.

> Atualize `YOUR_ORG/YOUR_REPO` no badge para o repositório real.

## Contribuição

Veja `CONTRIBUTING.md` para baseline local e branch protection recomendada.

## Rollback

Procedimento documentado em `ROLLBACK.md`.

## Incident Response

Checklist de incidente em `INCIDENT-CHECKLIST.md`.
