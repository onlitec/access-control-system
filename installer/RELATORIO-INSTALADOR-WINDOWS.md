# Relatório — Criação do Instalador Windows (OnliAcesso)

**Projeto:** access-control-system (condomínio Calabasas)
**Data:** 2026-07-03 (atualizado após validação em Windows real)
**Artefato final:** `installer/dist/OnliAcessoSetup-2.0.0.exe` (~226 MB, recompilado no Windows com Inno Setup 6.7.3)
**SHA256:** `bc56c522ebe4f01ac26808be813d276322529b6aee45c45f650986c173250802`

---

## 1. Objetivo

Empacotar o monorepo (que em produção roda em Docker + Nginx no Linux) num
**instalador Windows autocontido e automático**, capaz de instalar e configurar
todo o sistema num servidor Windows sem dependências externas: banco de dados,
runtime Node, proxy reverso, os quatro aplicativos e seus serviços — tudo a
partir de um único `.exe`.

Requisitos de aceitação:
- Instalação automática, sem scripts executados à mão pelo operador.
- Serviços registrados no Windows e iniciados automaticamente (inclusive no boot).
- Página da aplicação aberta no navegador ao final.
- Wizard com boas-vindas, configuração do condomínio/HikCentral e instalação.

---

## 2. Arquitetura do pacote

### Layout instalado (`C:\OnliAcesso\`)

| Pasta | Conteúdo |
|---|---|
| `binaries/` | Node 20, PostgreSQL 16, Nginx 1.26, ffmpeg, WinSW |
| `apps/` | backend-api (dist + node_modules de produção), frontend-visitor (Next standalone), frontend-access/dist, frontend-admin/dist, `serve-static.js` |
| `services/` | 6 wrappers WinSW (`.xml` + `.exe`) |
| `scripts/` | `install.ps1`, `uninstall.ps1`, `cleanup.ps1` |
| `data/` | cluster PostgreSQL (`pgdata`) + `db-secret.txt` |
| `logs/` | logs de instalação e dos serviços |
| `config/` | `credenciais.txt` |

### Serviços Windows (WinSW) e portas

Encadeados por dependência: **postgres → api → (visitor, access, admin) → proxy**

| Serviço | Porta | Papel | Conta |
|---|---|---|---|
| `onliacesso-postgres` | 5432 (ou 5433) | Banco PostgreSQL 16 | NetworkService |
| `onliacesso-api` | 3001 | Backend Express + Prisma | LocalSystem |
| `onliacesso-visitor` | 3002 | Portal morador/visitante (Next standalone) | LocalSystem |
| `onliacesso-access` | 3003 | Painel das portarias (estático Vite) | LocalSystem |
| `onliacesso-admin` | 3004 | Interface administrativa (estático Vite) | LocalSystem |
| `onliacesso-proxy` | 80 | Nginx (proxy reverso) | LocalSystem |

### Roteamento (Nginx, porta 80)

| Rota | Destino | Acesso |
|---|---|---|
| `/api/*` | 3001 (sem buffer, para streams de câmera) | público |
| `/login/*`, `/_next/*` | 3002 | público |
| `/painel/*` | 3003 | apenas IPs de rede privada |
| `/admin/*` | 3004 | apenas IPs de rede privada |
| `/` | 3003 (painel) | apenas IPs de rede privada |

Os frontends chamam a API via `window.location.origin + '/api'` (sem host/porta
hardcoded), então tudo passa pela porta 80 do proxy.

---

## 3. Componentes e versões

| Componente | Versão | Origem / verificação |
|---|---|---|
| Node.js | 20.20.2 win-x64 | nodejs.org — **SHA256 conferido** contra `SHASUMS256.txt` |
| PostgreSQL | 16.13-1 win-x64 | EDB (pgAdmin/docs removidos, ~500 MB a menos) |
| Nginx | 1.26.3 win | nginx.org |
| WinSW | 3.0.0-alpha.11 x64 | github.com/winsw/winsw |
| ffmpeg | master win64 gpl | github.com/BtbN/FFmpeg-Builds — **SHA256 conferido** via API do GitHub |
| schema-engine Prisma | (commit de `@prisma/engines-version`) | binaries.prisma.sh — **SHA256 conferido** |

Checksums registrados em `installer/windows/assets/binaries/CHECKSUMS.sha256`.

---

## 4. Processo de build

Automatizado por `installer/build-package.sh` (executado no Linux):

1. **Builds:** `tsc` (backend), `next build` (visitor, output standalone),
   `vite build` (access, admin).
2. **Staging** (`installer/windows/stage/`): binários, apps e scripts montados.
   - backend-api: `npm install --omit=dev`; **`prisma` promovido de devDep para
     dep** de produção (para o `migrate deploy` rodar no destino).
   - Prisma: `binaryTargets = ["native", "windows"]` no schema; o
     `schema-engine-windows.exe` é baixado à parte do CDN oficial (o postinstall
     do `@prisma/engines` só baixa o engine da plataforma local).
   - frontend-visitor: Next standalone + `.next/static` + `public`.
3. **Compilação do instalador:** `OnliAcesso.iss` via Docker `amake/innosetup`
   (Wine), compressão LZMA2 máxima, sólida.

O wizard (`OnliAcesso.iss`) tem: boas-vindas, página de configuração do
condomínio/HikCentral, seleção de pasta, ícone no desktop e checkbox para abrir
no navegador. A pós-instalação chama `install.ps1` automaticamente
(via `[Code]`/`CurStepChanged`), exibindo o progresso e, em caso de erro,
uma mensagem apontando os logs.

---

## 5. Problemas encontrados e correções

O desenvolvimento passou por várias iterações. Abaixo, cada falha e a correção.
A lição central: **as falhas iniciais foram diagnosticadas uma a uma sem validar
o sistema em execução**; a virada veio ao rodar o stack inteiro num ambiente de
teste (ver seção 7), o que expôs a causa-raiz comum — **incompatibilidade entre
o que o instalador produz e o que o código realmente consome**.

### 5.1 Serviços não eram registrados / instalação "concluía" sem avisar
- **Causa:** `install.ps1` rodava oculto e o Inno ignorava o código de saída;
  além disso o `postgres.exe` recusa rodar com token administrativo (LocalSystem).
- **Correção:** serviço postgres passou a rodar como `NetworkService`; a
  pós-instalação passou a exibir erro na tela e o código de saída é respeitado.

### 5.2 Travamento na etapa do banco
- **Causa:** capturar a saída do `pg_ctl start` no PowerShell trava para sempre
  — o processo-filho `postgres.exe` herda os handles de stdout/stderr e o
  pipeline nunca fecha.
- **Correção:** helper `Invoke-Native` usando `Start-Process` + `WaitForExit`
  com timeout, redirecionando para arquivos temporários. Também: `icacls` sem
  `/T` (evita reescrever ACL de ~8 mil arquivos) e feedback visual do progresso.

### 5.3 Falha de autenticação do PostgreSQL
- **Causa:** a desinstalação preserva `data\pgdata` mas removia o `.env`; a
  reinstalação gerava senha nova para um cluster que só aceitava a antiga.
- **Correção:** a senha do banco passou a ser persistida em `data\db-secret.txt`
  (sobrevive à desinstalação) e, se ainda assim não conferir, o `install.ps1`
  **redefine a senha** via modo `trust` temporário no `pg_hba.conf` (localhost).

### 5.4 Pasta de instalação não podia ser excluída
- **Causa:** processos remanescentes (`postgres.exe`, `nginx.exe`) de tentativas
  travadas seguravam arquivos.
- **Correção:** novo `cleanup.ps1`, executado automaticamente **antes** da cópia
  (via `PrepareToInstall`), que para serviços e finaliza processos rodando a
  partir da pasta. O `uninstall.ps1` também passou a fazer isso.

### 5.5 Código de saída falso do `icacls` / IP errado
- **Causa:** condição de corrida do `Start-Process -PassThru` (ExitCode vazio
  para processos rápidos); detecção de IP escolhia o endereço do Tailscale.
- **Correção:** cachear `$p.Handle` antes de ler `ExitCode`; priorizar IPs de
  LAN (RFC 1918) e despriorizar CGNAT 100.64/10.

### 5.6 ACL do `pgdata` só aplicada em cluster novo
- **Causa:** a permissão de escrita do `NetworkService` sobre `data\pgdata` só
  era concedida quando o `initdb` rodava; em reinstalação sobre cluster antigo o
  serviço postgres não conseguiria gravar.
- **Correção:** a ACL passou a ser reaplicada em toda instalação. Também: parada
  limpa do postgres via `pg_ctl stop` (evita recovery a cada start).

### 5.7 Migrações Prisma quebravam em banco novo (causa estrutural do projeto)
- **Causa:** o histórico de `prisma/migrations` divergia **muito** do
  `schema.prisma` (projeto gerido com `prisma db push` em produção). Em banco
  novo faltavam: a tabela `condominium_settings`, ~8 colunas em `access_events`,
  **9 tabelas inteiras** e dezenas de colunas em `persons`/`visitors`/`users`/etc.
- **Correção:** **3 migrações novas idempotentes**, sem editar nenhuma existente
  (checksums de produção preservados):
  - `20260628225000_condominium_settings`
  - `20260702090000_access_events_reconcile_columns`
  - `20260702300000_reconcile_schema_drift` (reconciliação gerada por
    `prisma migrate diff`, com `IF NOT EXISTS`/`IF EXISTS` e blocos `DO` nas FKs).
  - Detalhado no memory do projeto (`project_migration_drift.md`).

### 5.8 Criação do admin inicial chamava o script errado (causa-raiz final)
- **Causa:** `install.ps1` chamava `bootstrap-admin.js`, que exige as variáveis
  `ADMIN_EMAIL`/`ADMIN_PASSWORD`; o `.env` gerado usa `INITIAL_ADMIN_*`. Falha:
  `ADMIN_EMAIL and ADMIN_PASSWORD must be set`. Como isso ocorria **antes** da
  etapa de registro dos serviços, os serviços nunca chegavam a ser criados.
- **Correção:** passou a chamar `create-protected-admin.js` (lê `INITIAL_ADMIN_*`
  e cria admin protegido). Adicionada também espera de prontidão do PostgreSQL
  (`pg_isready`) antes de iniciar a API.

### 5.9 Serviço postgres não iniciava: WinSW "Failed to open the service. Acesso negado."
*(encontrado na primeira instalação em Windows real)*
- **Causa:** o serviço postgres roda como `NetworkService`; no start, o WinSW v3
  reabre o próprio serviço no SCM com direitos de escrita (refresh da config a
  partir do XML). A conta `NetworkService` não tem acesso ao objeto do serviço,
  então o WinSW morria antes de reportar "started" → timeout de 30 s no SCM
  (evento 7009) → os 5 serviços dependentes falhavam em cascata.
- **Correção:** `install.ps1` aplica `sc.exe sdset onliacesso-postgres` com uma
  ACE de acesso total para `NetworkService` logo após registrar o serviço.
  Obs.: ACE apenas com start/stop/query (`RPWPDT...`) **não** basta — o refresh
  exige `SERVICE_CHANGE_CONFIG`; foi validado empiricamente que somente a ACE
  de acesso total (`CCDCLCSWRPWPDTLOCRSDRCWDWO`) resolve.

### 5.10 Loop infinito de redirect 308 em `/login`
*(encontrado na primeira instalação em Windows real)*
- **Causa:** `location /login/ { ... }` (com barra) no nginx: o nginx
  redirecionava `/login` → `/login/`, e o Next (trailingSlash desligado)
  redirecionava `/login/` → `/login` — loop de 308 permanente.
- **Correção:** `location /login` (sem barra) no `nginx.conf`; o Next responde
  200 direto em `/login`.

---

## 6. Correção de segurança e robustez adicionais
- `credenciais.txt` e `db-secret.txt` com ACL restrita a Administradores/SYSTEM.
- Detecção de porta 5432 ocupada → usa 5433 automaticamente (gravado no `.env`
  e no `postgresql.conf`).
- Regra de firewall (TCP 80) criada de forma idempotente.
- Logs com rotação por tamanho (10 MB, 5 arquivos).

---

## 7. Validação end-to-end

Antes do empacotamento final, todo o stack foi executado **no Linux com os
artefatos empacotados** (staging), contra um PostgreSQL de teste:

| Componente | Teste | Resultado |
|---|---|---|
| Migrações | `migrate deploy` desde banco vazio (19 migrações) | ✓ aplica limpo, drift zero vs `schema.prisma` |
| Idempotência | SQL de reconciliação aplicado 2× | ✓ sem erros |
| Admin | `create-protected-admin.js` | ✓ admin protegido criado |
| Backend | boot do `dist/server.js`, `/api/health` | ✓ HTTP 200 |
| Login | POST `/api/auth/login` com o admin | ✓ HTTP 200 + token JWT |
| Visitor (Next) | `/login` | ✓ HTTP 200 |
| Access (estático) | `/painel/` | ✓ HTTP 200 (app root presente) |
| Admin (estático) | `/admin/` | ✓ HTTP 200 |
| Nginx | `nginx -t` e roteamento completo pelo proxy | ✓ sintaxe ok; login real via proxy 200 |

**Validação em Windows real (2026-07-03):** a etapa WinSW foi finalmente
exercitada num Windows 11 de verdade e expôs os problemas 5.9 e 5.10 (acima).
Após as correções, o stack completo foi validado na máquina Windows:

| Teste | Resultado |
|---|---|
| 6 serviços WinSW (`services.msc`) | ✓ todos **Running** |
| Migrações (19) desde banco vazio | ✓ aplicadas |
| Admin inicial (`create-protected-admin.js`) | ✓ criado |
| `GET /api/health` via proxy (porta 80) | ✓ 200 |
| `/painel/`, `/admin/`, `/login` via proxy | ✓ 200 |
| `POST /api/auth/login` (credencial inválida) | ✓ 401 com erro correto (API↔banco OK) |
| ACL de `credenciais.txt` | ✓ negado a usuário não elevado |

---

## 8. Fragilidades conhecidas (decisões de projeto, não defeitos)

- **Sem HTTPS:** todo o tráfego é HTTP na porta 80. Credenciais (admin e morador),
  tokens JWT e streams de câmera trafegam em claro. Aceitável em LAN isolada;
  para exposição externa, recomenda-se TLS.
- **API em `0.0.0.0:3001`:** acessível diretamente na LAN, contornando as
  restrições de IP do Nginx (o firewall só abre a porta 80). Endurecer exigiria
  bind em `127.0.0.1` no código do backend.
- **Segredos em texto no `.env`:** necessário para a API; padrão da indústria.
- **Drift de migrações:** se o projeto voltar a usar `prisma db push`, o drift
  reaparece. Manter o fluxo por migrações.

---

## 9. Estado atual e uso

**Instalador:** `installer/dist/OnliAcessoSetup-2.0.0.exe`
**SHA256:** `bc56c522ebe4f01ac26808be813d276322529b6aee45c45f650986c173250802`

O build também pode ser feito no Windows: com o staging pronto em
`installer/windows/stage/`, basta compilar com o Inno Setup nativo:
`ISCC.exe /DAppVersion=<versão> installer\windows\OnliAcesso.iss`
(o staging gerado no Linux é compatível — os `node_modules` do backend usam
apenas dependências JS puras + engines Prisma para Windows).

### Para instalar (no servidor Windows)
1. Executar o `.exe` como Administrador.
2. Preencher o nome do condomínio (e HikCentral, se houver; senão, modo local).
3. A instalação é automática: limpeza → cópia → banco → admin → 6 serviços →
   navegador abre no painel.
4. Acessos:
   - Painel das portarias: `http://localhost/painel/` (ou pelo IP da LAN)
   - Administração: `http://localhost/admin/`
   - Portal do morador: `http://localhost/login/`
5. Credenciais geradas: `C:\OnliAcesso\config\credenciais.txt`.

### Diagnóstico
- Logs: `C:\OnliAcesso\logs\install.log` e `%TEMP%\onliacesso-install.log`.
- Serviços: `services.msc` → 6 serviços "OnliAcesso - ...".

---

## 10. Arquivos-chave do pacote

```
installer/
├── build-package.sh                       # orquestra build + staging + Inno
├── windows/
│   ├── OnliAcesso.iss                      # wizard Inno Setup
│   ├── scripts/
│   │   ├── download-binaries.sh            # baixa binários (com SHA256)
│   │   ├── install.ps1                     # pós-instalação (automática)
│   │   ├── uninstall.ps1
│   │   └── cleanup.ps1                     # limpeza pré-cópia
│   └── assets/
│       ├── nginx/nginx.conf                # proxy reverso
│       ├── services/onliacesso-*.xml       # 6 serviços WinSW
│       └── serve-static.js                 # servidor estático (Vite SPA)
└── dist/OnliAcessoSetup-2.0.0.exe          # instalador final
```

---

## 11. Versão 2.1.0-beta.3 — painel admin nativo Windows + melhorias profissionais

**Artefato:** `installer/dist/OnliAcessoSetup-2.1.0-beta.3.exe` (assinado, auto-assinado + timestamp DigiCert)
**SHA256:** `ac4986a12b2790dd4c79c70d0f7ca813744ac110ee2b6718673308190bd2b1b6`

### Correções do painel admin
- **Causa-raiz dos erros reportados:** `frontend-admin\.env` fixava
  `VITE_API_URL=https://172.20.120.41:8443/api` (IP do antigo servidor Linux),
  assado no bundle. Removido; o app usa `window.location.origin + '/api'`.
- `/api/ops/*` reescrito para Windows nativo: containers Docker → **serviços
  Windows** (`GET /ops/services`, `POST /ops/services/:name/restart` — restart
  da api/postgres via tarefa agendada SYSTEM, fora da árvore do WinSW);
  `statfs` no drive de instalação; backup via **pg_dump.exe embarcado**
  (BACKUP_DIR=C:\OnliAcesso\backups); logs lidos dos arquivos WinSW
  (`services\<svc>.out|err.log` — o WinSW v3 grava ao lado do wrapper, não em logs\).
- Páginas: ContainersPage → ServicesPage; SystemHealthPage monitora os 6
  serviços onliacesso-*; LogsPage com seletor de serviço/stream.

### Melhorias profissionais
- **SMTP configurável no painel** (`/admin/system-settings`): tabela singleton
  `system_settings` (migração idempotente `20260703100000_system_settings`),
  fallback campo a campo para o `.env`, botão de e-mail de teste.
- **Verificação de atualização:** `GET /ops/update-check` compara `APP_VERSION`
  (gravada no `.env` pelo instalador) com manifesto JSON remoto
  (`{version,url,sha256,notes}`) em URL configurável no painel.
- **Instalação silenciosa:** `install.ps1` roda oculto; progresso em página
  nativa do wizard (status/exit files em %TEMP%). `.env` em upgrade ganha
  chaves novas via upsert (APP_VERSION sempre atualizada).
- **Assinatura de código:** `scripts/sign-setup.ps1` — certificado auto-assinado
  (CN=Onlitec OnliAcesso, `installer/certs/`, fora do git) +
  `Set-AuthenticodeSignature` com timestamp DigiCert. Para certificado
  comercial: apontar `-PfxPath`/`-PfxPassword` para o .pfx comprado.

### Pendências conhecidas
- Restore de backup pela interface (TODO no código).
- Criptografia da senha SMTP no banco (hoje em texto, mesmo nível do .env).
- Em reinstalação sobre banco existente, `create-protected-admin` não atualiza
  a senha do admin protegido — `credenciais.txt` novo pode divergir da senha
  real (corrigido manualmente nesta instalação; automatizar no futuro).

---

*Relatório gerado automaticamente durante o desenvolvimento do instalador.*
