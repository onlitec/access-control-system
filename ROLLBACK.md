# Rollback Runbook

Use este runbook quando um deploy causar regressão funcional ou operacional.

## 1. Conter impacto

1. Pause mudanças novas (freeze de deploy).
2. Capture evidências:
   - `docker compose ps`
   - `docker compose logs --tail=300`
   - `./scripts/ops.sh status-json`

## 2. Restaurar aplicação

Se rollback for apenas de aplicação (sem perda de dados):
1. Volte para o commit/tag anterior.
2. Rebuild dos serviços afetados:
   - `docker compose up -d --build backend-api frontend-admin nginx`
3. Valide:
   - `./scripts/ops.sh smoke security.test@local 'ChangeMe123!'`
   - `./scripts/ops.sh e2e-admin`

## 3. Restaurar banco (quando necessário)

Se houve migração incompatível ou corrupção de dados:
1. Liste backups: `./scripts/ops.sh list-backups`
2. Execute restore (destrutivo):  
   `./scripts/ops.sh restore-db ./backups/<arquivo>.dump --yes`
3. Suba stack novamente:
   - `docker compose up -d`
4. Revalide smoke/e2e.

## 4. Critério de saída

Rollback é considerado concluído quando:
1. `./scripts/ops.sh smoke ...` passa.
2. `./scripts/ops.sh e2e-admin` passa.
3. `docker compose ps` mostra serviços críticos `healthy`.
4. Métricas/alertas retornam ao baseline esperado.
