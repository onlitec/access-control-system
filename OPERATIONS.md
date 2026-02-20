# Operations Runbook

## Current active mode (local TLS)
- HTTP: `http://127.0.0.1:8080` (redirects to HTTPS)
- HTTPS: `https://127.0.0.1:8443` (self-signed)

Commands:
- `./scripts/ops.sh up`
- `./scripts/ops.sh ps`
- `./scripts/ops.sh health`
- `./scripts/ops.sh smoke`
- `./scripts/ops.sh smoke <email> <password>` (inclui validação de login/refresh/logout)
- `./scripts/ops.sh backend-contract` (validação de contrato da API backend)
- `./scripts/ops.sh cert 365` (regenerate self-signed cert)

## Let's Encrypt mode (real domain)
This mode uses ports `80/443` and `docker-compose.letsencrypt.yml`.

Prerequisites:
- DNS A/AAAA for your domain pointing to this server.
- Ports 80 and 443 open.

Initialize certificate:
- `./scripts/ops.sh le-init <domain> <email> [staging:true|false]`
- Example: `./scripts/ops.sh le-init access.example.com ops@example.com true`

Renew certificate manually:
- `./scripts/ops.sh le-renew`

Notes:
- `le-init` performs bootstrap HTTP config, issues cert via certbot webroot, then switches to full HTTPS config.
- In Let's Encrypt mode, nginx config source becomes `nginx.letsencrypt.conf`.

## Bootstrap Admin (backend)
To create/update an initial admin user securely (bcrypt hash):
- `ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='strong-password' ADMIN_NAME='Platform Admin' ADMIN_ROLE=ADMIN npm run --workspace backend-api bootstrap:admin`

Optional backend env hardening:
- `CORS_ORIGIN=https://your-domain.com,https://admin.your-domain.com`
- `JWT_EXPIRES_IN=12h`
- `REFRESH_TOKEN_EXPIRES_IN=7d`
- `MAX_ACTIVE_REFRESH_SESSIONS=5`
- `REFRESH_REVOKED_RETENTION_DAYS=30`
- `SESSION_AUDIT_EXPORT_MAX_LIMIT=20000`
- `SESSION_AUDIT_RETENTION_DAYS=90`
- `SESSION_AUDIT_PRUNE_INTERVAL_MINUTES=60` (`0` desabilita prune automático)
- `SECURITY_METRICS_WINDOW_HOURS=24`
- `SECURITY_METRICS_TOP_N=10`
- `SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES=15` (`0` desabilita coleta automática)
- `SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS=30`
- `SECURITY_METRICS_HISTORY_DEFAULT_POINTS=96`

Auth token flow:
- `POST /api/auth/login`: retorna `token` + `refreshToken`
- `POST /api/auth/refresh`: revoga sessão anterior e retorna novo par de tokens
- `POST /api/auth/logout`: revoga o `refreshToken` informado
- `POST /api/auth/logout-all`: revoga todas as sessões do usuário autenticado
- `GET /api/auth/sessions`: lista sessões ativas do usuário autenticado
- `POST /api/auth/revoke-session`: revoga uma sessão específica do usuário (`sessionId`)
- Excesso de sessões ativas por usuário é automaticamente revogado com base em `MAX_ACTIVE_REFRESH_SESSIONS`
- Eventos de sessão (`login`, `refresh`, `logout`, `logout-all`, `list_sessions`, `revoke_session`) são auditados na tabela `session_audit_events`
- `GET /api/security/session-audit` (ADMIN): consulta paginada com filtros `userEmail`, `eventType`, `success`, `startTime`, `endTime`, `ipAddress`, `sessionId` e ordenação `sortBy/sortOrder`
- `GET /api/security/session-audit/export/meta` (ADMIN): retorna contagem para export e limite efetivo
- `GET /api/security/session-audit/export` (ADMIN): exporta CSV com os mesmos filtros/ordenação (`limit` respeita `SESSION_AUDIT_EXPORT_MAX_LIMIT`)
- `GET /api/security/metrics` (ADMIN): métricas de segurança (taxa de falha de login, tentativas por IP e usuário)
- `GET /api/security/metrics/history` (ADMIN): histórico de snapshots de métricas (série temporal)
- `POST /api/security/metrics/snapshots` (ADMIN): força coleta imediata de snapshot
- Prune automático de auditoria é executado pelo backend em intervalo configurável (`SESSION_AUDIT_PRUNE_INTERVAL_MINUTES`)
- Coleta/prune automático de snapshots de métricas é executado pelo backend em intervalo configurável (`SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES`)

## Database backup/restore
Create backup:
- `./scripts/ops.sh backup-db`

Verify backup+restore integrity (destructive for DB contents, but restores from latest backup):
- `./scripts/ops.sh backup-verify`
- or `make backup-verify`

Manual refresh session prune:
- `./scripts/ops.sh prune-refresh-sessions`

Manual session audit prune:
- `cd backend-api && npm run prune:session-audit-events`

Manual security metrics snapshot collect/prune:
- `./scripts/ops.sh collect-security-metrics-snapshot [window_hours] [top_n]`
- `./scripts/ops.sh prune-security-metrics-snapshots [retention_days]`

List backups:
- `./scripts/ops.sh list-backups`

Restore backup (destructive, requires confirmation):
- `./scripts/ops.sh restore-db ./backups/<file>.dump --yes`

Notes:
- Backups are stored in `backups/` and retention keeps last 15 files.
- Restore recreates the target database before import.

Backup freshness check:
- `./scripts/ops.sh backup-status` (default max age: 24h)
- `./scripts/ops.sh backup-status 6` (max age: 6h)

## Monitoring and alerting
One-shot monitoring check:
- `./scripts/ops.sh monitor-once`

Continuous loop (every 5 minutes by default):
- `./scripts/ops.sh monitor-loop`
- Custom interval: `./scripts/ops.sh monitor-loop 10`

Webhook alerting (optional in `.env`):
- `ALERT_WEBHOOK_URL=https://hooks.example.com/...`
- `ALERT_CHANNEL=access-control-system`

Behavior:
- Runs smoke tests and backup freshness check.
- On failure, sends webhook alert and exits non-zero (`monitor-once`).

## E2E regression
Run frontend-admin security E2E suite:
- `./scripts/ops.sh e2e-admin`
- or `make e2e-admin`

Run backend API contract suite:
- `./scripts/ops.sh backend-contract`
- or `make backend-contract`

Run full local regression suite (coverage + smoke + backend contract + E2E):
- `./scripts/ops.sh regression`
- or `make regression`

Run release gate (backup + freshness + health + regression):
- `./scripts/ops.sh release-gate`
- or `make release-gate`
- Optional env:
  - `RUN_BACKUP=false` (pula criação de novo backup)
  - `BACKUP_MAX_AGE_HOURS=24` (janela máxima para backup válido)

Environment overrides (optional):
- `E2E_BASE_URL` (default `https://localhost:8443`)
- `E2E_API_BASE` (default `https://localhost:8443/api`)
- `E2E_ADMIN_EMAIL` (default `security.test@local`)
- `E2E_ADMIN_PASSWORD` (default `ChangeMe123!`)

GitHub Actions:
- Workflow: `.github/workflows/security-regression.yml`
- Executa em `push` (`main`/`master`) e `pull_request`
- Também executa por agendamento diário e `workflow_dispatch` manual
- Pipeline: install deps -> build/start compose -> bootstrap admin -> regression suite -> build checks
- Em falha, anexa artefatos de diagnóstico:
  - `playwright-artifacts` (report, traces, screenshots, vídeos)
  - `coverage-artifacts` (lcov e relatórios de cobertura)
  - `compose-logs` (logs consolidados do stack)

Rollback:
- Ver `ROLLBACK.md` para runbook completo de contenção, rollback app e restore DB.

Backup verification CI:
- Workflow: `.github/workflows/backup-verify.yml`
- Executa diariamente e manualmente.
- Fluxo: start core services -> `backup-verify` -> upload metadados de backup.

CI failure webhook alerts (optional):
- Workflows `security-regression` e `backup-verify` enviam alerta em falha quando secrets estão configuradas:
  - `ALERT_WEBHOOK_URL`
  - `ALERT_CHANNEL` (opcional)

Incident response:
- Checklist rápido em `INCIDENT-CHECKLIST.md`.

## Host scheduling (cron)
Install managed cron jobs (defaults):
- Monitor every 5 minutes
- Backup every 6 hours
- Rotate Ops auth weekly
- Prune refresh sessions daily (`30 3 * * *`)
- Prune security metrics snapshots daily (`0 4 * * *`)
- Command: `./scripts/ops.sh cron-install`

Custom schedules:
- `./scripts/ops.sh cron-install "*/10 * * * *" "0 2 * * *" "0 3 * * 0" "30 3 * * *" "0 4 * * *"`

Check current crontab:
- `./scripts/ops.sh cron-status`

Uninstall managed cron jobs:
- `./scripts/ops.sh cron-uninstall`

Logs:
- `monitoring/cron/monitor.log`
- `monitoring/cron/backup.log`
- `monitoring/cron/refresh-prune.log`
- `monitoring/cron/security-metrics-prune.log`

Status JSON endpoint:
- Generate locally: `./scripts/ops.sh status-json`
- Exposed via Nginx: `https://127.0.0.1:8443/ops/status.json`

## Ops endpoint protection
Endpoint:
- `https://127.0.0.1:8443/ops/status.json`

Behavior:
- Protected with Basic Auth (`401` without credentials).

Manage credentials:
- Set/update: `./scripts/ops.sh set-ops-auth <user> <password>`
- Clear credentials: `./scripts/ops.sh clear-ops-auth`

Example access:
- `curl -k -u <user>:<password> https://127.0.0.1:8443/ops/status.json`

Automatic Ops auth rotation:
- One-time rotate: `./scripts/ops.sh rotate-ops-auth`
- Custom user/length: `./scripts/ops.sh rotate-ops-auth opsadmin 32`
- Latest generated credentials file: `auth/ops-current-credentials.txt` (mode 600)

Cron rotation:
- Included in `cron-install` by default (weekly at `0 3 * * 0`)
- Custom schedules: `./scripts/ops.sh cron-install "*/5 * * * *" "0 */6 * * *" "0 1 * * 1" "30 3 * * *" "0 4 * * *"`

Audit log:
- JSON lines file: `monitoring/audit.log`
- Tracks ops actions such as `ops_auth_set`, `ops_auth_clear`, `ops_auth_rotate`, `cron_install`, `cron_uninstall`.
