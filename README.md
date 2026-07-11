# OnliAcesso — Controle de Acesso e Câmeras

[![Security Regression](https://github.com/YOUR_ORG/YOUR_REPO/actions/workflows/security-regression.yml/badge.svg)](https://github.com/YOUR_ORG/YOUR_REPO/actions/workflows/security-regression.yml)

Sistema de controle de acesso para condomínios: moradores, visitantes,
prestadores, entregas, terminais faciais, guarita e **câmeras (VMS)**. Funciona
em modo **standalone** — todos os dados vêm do PostgreSQL local, sem depender de
servidores externos.

## Aplicações

| Pasta | O que é |
|---|---|
| `backend-api/` | API (Express + Prisma). Inclui `src/vms/` — o serviço de câmeras, que roda como processo próprio |
| `frontend-access/` | Painel da portaria: acessos, entregas, eventos e o **videowall** das câmeras |
| `frontend-admin/` | Administração: usuários, integrações, cadastro de câmeras e armazenamento |
| `frontend-visitor/` | Portal do morador/visitante (Next.js) |
| `frontend-cloud/` | **PWA de acesso remoto às câmeras** (`cloud.onlitec.com.br`) |
| `installer/` | Instalador Windows (Inno Setup) — o VMS é um componente opcional |
| `deploy/cloud/` | Infraestrutura do acesso remoto: proxy, TURN e deploy da PWA |

## VMS — câmeras

Cadastro de câmeras IP, NVRs e DVRs (Hikvision/ISAPI, ONVIF ou RTSP), com:

- **Ao vivo**: mosaico estilo NVR, WebRTC (latência abaixo de 1s) e HLS de reserva
- **Gravação**: contínua, agendada, por evento (movimento/VCA) ou manual
- **Armazenamento**: disco local com retenção, e envio para Google Drive, OneDrive,
  pasta compartilhada (SMB), FTP ou SFTP via rclone
- **Acesso remoto**: pela PWA em `cloud.onlitec.com.br`

Componentes: **MediaMTX** (servidor de mídia) e **rclone**, empacotados no
instalador e executados como serviços Windows (`onliacesso-mediamtx`,
`onliacesso-vms`).

> **Segurança:** a API de controle do MediaMTX (porta 9997) nunca deve ser
> exposta — ela devolve as URLs RTSP **com as senhas das câmeras**. Todo acesso a
> vídeo é autenticado pelo backend, e só usuários do sistema (não moradores)
> podem ver as câmeras. Ver `deploy/cloud/README.md`.

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
