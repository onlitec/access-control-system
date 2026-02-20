# Incident Checklist

## A. Falha no workflow `backup-verify`

1. Confirmar escopo:
   - Workflow: `Backup Verify`
   - Run URL no alerta/artifacts.
2. Coletar evidências:
   - Artifact `backup-verify-artifacts`:
     - `backups-list.txt`
     - `backups-sha256.txt`
     - `backup-status.txt`
     - `compose-logs.txt` (se existir)
3. Reproduzir localmente:
   - `./scripts/ops.sh backup-verify`
4. Classificar falha:
   - Backup não cria: verificar disco/permissão/container DB.
   - Restore falha: verificar integridade dump e versão das ferramentas.
   - Validação de dado falha: investigar schema/migrations recentes.
5. Mitigar:
   - Se indisponibilidade: iniciar rollback conforme `ROLLBACK.md`.
   - Se corrupção: restaurar último backup íntegro.
6. Encerrar:
   - Executar novamente `backup-verify`.
   - Registrar causa raiz e ação preventiva.

## B. Falha no workflow `security-regression`

1. Confirmar etapa que falhou:
   - coverage gate, smoke, E2E ou build checks.
2. Coletar evidências:
   - Artifacts `playwright-artifacts`, `coverage-artifacts`, `compose-logs`.
3. Reproduzir localmente:
   - `./scripts/ops.sh regression`
4. Mitigar:
   - Corrigir regressão e reexecutar suíte completa.
5. Encerrar:
   - Garantir workflow verde antes do merge/deploy.
