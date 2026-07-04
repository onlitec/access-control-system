# Análise e Documentação Técnica - Sistema de Controle de Acesso (Calabasas Access)

Este documento apresenta uma análise técnica completa e estruturada do projeto **Calabasas Access**, um sistema corporativo de controle de acesso condominial integrado com **HikCentral Professional (via Artemis OpenAPI)**, **Nice Guarita MG3000** e **Video Porteiros Hikvision (via ISAPI)**.

---

## 1. Estrutura de Diretórios do Projeto

O projeto é estruturado como um monorepo gerenciado via **NPM Workspaces**, separando de forma clara o backend, múltiplos frontends e código compartilhado.

```plaintext
/opt/access-control-system
├── backend-api/             # API Backend principal (Express, TypeScript, Prisma ORM)
├── frontend-visitor/        # Frontend para Visitantes (Next.js, Tailwind v4, React 19)
├── frontend-access/         # Painel de Controle operacional da portaria (Vite, React 18, Tailwind v3)
├── frontend-admin/          # Painel de Administração técnica (Vite, React 18, Tailwind v3)
├── shared/                  # Interfaces de dados compartilhadas entre backend e frontends
├── sdk-nice/                # Documentação do protocolo MG3000 e demonstrações em C# / Delphi
├── certs/                   # Certificados SSL locais para HTTPS (localhost.crt, localhost.key)
├── auth/                    # Arquivos de autenticação básica para o Nginx (.htpasswd)
├── monitoring/              # Diretório para coleta e exportação de logs e status.json
├── scripts/                 # Scripts Bash operacionais (backup, restore, monitoramento, crons)
├── docker-compose.yml       # Orquestração Docker principal em ambiente de desenvolvimento/produção local
├── nginx.conf               # Configurações do Proxy Reverso principal para roteamento local SSL
└── package.json             # Definição do monorepo e comandos de build/dev unificados
```

---

## 2. Stack Tecnológica e Linguagens de Programação

O ecossistema é baseado inteiramente em **Node.js** com forte uso de tipagem estática e conteinerização.

### Linguagens de Programação
*   **TypeScript (v5.x):** Utilizado em toda a lógica do backend, frontends e interfaces compartilhadas.
*   **JavaScript (ES6+):** Utilizado em alguns scripts de configuração e utilitários de banco.
*   **Shell Script (Bash):** Utilizado para scripts operacionais de infraestrutura, rotinas de cron, backups e testes de integração.
*   **SQL (PostgreSQL):** Linguagem de manipulação de banco de dados subjacente.

### Backend Stack
*   **Runtime:** Node.js (versão `>=20 <21`).
*   **Framework Web:** Express.js (v4.18.x) para API RESTful.
*   **Banco de Dados & ORM:** PostgreSQL (v15-alpine) gerenciado por Prisma ORM (v5.10.x).
*   **Segurança:** JSON Web Tokens (`jsonwebtoken` v9.x) para controle de sessão, `bcryptjs` para hashing de senhas, e `helmet` para cabeçalhos de segurança HTTP.
*   **Testes:** Vitest (v4.x) para testes unitários e de integração, e Supertest para simulação de requisições HTTP.

### Frontend Stack
*   **Next.js (v16.1.6) & React 19:** Utilizados na aplicação de visitantes (`frontend-visitor`).
*   **Vite & React 18:** Utilizados nos painéis administrativo e operacional (`frontend-admin` e `frontend-access`).
*   **Roteamento:** `react-router-dom` v6 no painel admin e v7 no painel de portaria.
*   **Estilização:** Tailwind CSS (v4 no visitor, v3 nos demais) integrado com PostCSS, Autoprefixer, `tailwind-merge` e `class-variance-authority`.
*   **UI Components:** Radix UI primitives no painel operacional (`frontend-access`), Lucide React para ícones, e Recharts para relatórios gráficos de segurança.
*   **Testes E2E:** Playwright (v1.56.x) no painel admin.

### Infraestrutura e Redes
*   **Docker & Docker Compose:** Utilizado para empacotamento e execução isolada de todos os serviços.
*   **Nginx (Alpine):** Atua como o proxy reverso principal, centralizador SSL e roteador do tráfego.

---

## 3. Aplicações e Módulos Internos

1.  **`backend-api` ([backend-api](file:///opt/access-control-system/backend-api)):** Fornece os endpoints REST de autenticação, relatórios, cadastros e aciona as integrações de hardware. Inclui servidores TCP e scripts em segundo plano para auditorias de segurança e backups.
2.  **`frontend-visitor` ([frontend-visitor](file:///opt/access-control-system/frontend-visitor)):** Interface web que gerencia o fluxo de pré-cadastro de visitantes, geração de convites e coleta de termos de consentimento da LGPD.
3.  **`frontend-access` ([frontend-access](file:///opt/access-control-system/frontend-access)):** Interface operacional voltada aos porteiros e operadores de segurança. Apresenta o fluxo em tempo real de acessos, eventos de campainha e alarmes de passback.
4.  **`frontend-admin` ([frontend-admin](file:///opt/access-control-system/frontend-admin)):** Painel executivo para configuração do sistema, vinculação de áreas HikCentral, monitoramento do hardware, gerenciamento de crons e auditorias.
5.  **`shared` ([shared](file:///opt/access-control-system/shared)):** Biblioteca contendo tipos e contratos de dados comuns compartilhados entre frontends e backend.

---

## 4. Portas Web, Acessos e Rotas de Navegação

A comunicação externa é centralizada através do Nginx que escuta nas portas principais de rede e redireciona internamente para os containers Docker correspondentes.

### Portas Externas (Host)
*   **`8080` (HTTP):** Redireciona imediatamente todo o tráfego para HTTPS (`https://[host]:8443$request_uri`).
*   **`8443` (HTTPS):** Porta de acesso principal criptografada (usa TLS).
*   **`5433` (PostgreSQL):** Porta externa mapeada para acesso direto ao banco de dados PostgreSQL (interno na porta 5432).

### Rotas de Navegação e Caminhos do Nginx (Porta `8443`)

| Rota / Caminho Nginx | Destino Interno (Container / Serviço) | Descrição do Acesso / Funcionalidade |
| :--- | :--- | :--- |
| `/` | Redirecionamento `302 /login` | Redireciona o tráfego raiz para o portal do visitante |
| `/login` | `http://frontend-visitor:3000` | Página de login e registro de visitantes (Next.js) |
| `/_next/` | `http://frontend-visitor:3000` | Arquivos estáticos e bundle da aplicação Next.js |
| `/painel` / `/painel/` | `http://frontend-access:80` | Painel operacional da portaria (Vite/React estático) |
| `/admin` / `/admin/` | `http://frontend-admin:80` | Painel de administração técnica (Vite/React estático) |
| `/api/auth/login` | `http://backend-api:3001` | Rota de autenticação da API (com rate limiting de 10 req/min) |
| `/api/doorbell/devices/[id]/stream` | `http://backend-api:3001` | Stream de vídeo MJPEG direto do Video Porteiro (buffering desativado) |
| `/api/...` | `http://backend-api:3001` | Demais chamadas REST de dados, relatórios e controle de hardware |
| `/ops/status.json` | Arquivo `/var/www/monitoring/status.json` | Endpoint de status operacional (Protegido por Basic Auth e IP restrito) |

---

## 5. Integrações de Hardware e Protocolos

A integração com o hardware físico é o núcleo da aplicação e segue diretrizes estritas de desenvolvimento:

### A. HikCentral Professional (Artemis OpenAPI Gateway)
Toda a comunicação com catracas, leitores faciais e NVRs é centralizada via Artemis OpenAPI, sendo proibida a conexão direta por IP com estes dispositivos (exceto vídeo porteiros).
*   **Regra de Autenticação:** Assinatura de todas as requisições usando chaves `X-Ca-Key` e assinatura `X-Ca-Signature` computada via HMAC-SHA256, enviando cabeçalho obrigatório `Accept: */*` e `Content-Type: application/json`.
*   **IP Base:** Configurado na variável `HIKCENTRAL_IP_BASE` no `.env`. As URLs retornadas pela API (ex: fotos) são sanitizadas pelo backend para apontar para este IP.
*   **Magic Byte JPEG:** Validação se as imagens baixadas do HikCentral começam com os bytes `0xFF 0xD8 0xFF` (Magic Byte JPEG) antes de transmiti-las ao frontend em Base64.
*   **Endpoints Principais Utilizados:**
    *   `/artemis/api/resource/v1/person/single/add` & `/artemis/api/resource/v1/person/single/update`: Criação e alteração de moradores/prestadores.
    *   `/artemis/api/resource/v1/face/single/add`: Injeção de fotos faciais.
    *   `/artemis/api/visitor/v1/visitor/reserve`: Reserva e agendamento de visitantes.
    *   `/artemis/api/acs/v1/door/events`: Captura de logs de acesso físicos das portas.
    *   `/artemis/api/resource/v1/acsDevice/acsDeviceList` & `/artemis/api/resource/v1/accessLevel/accessLevelList`: Mapeamento físico dos dispositivos.

### B. Nice Guarita MG3000 (Protocolo Binário Linear HCS)
Integração com receptores RF (controles remotos de garagem, tags ativos/passivos e biometrias de dedo).
*   **Porta TCP Listener:** O backend escuta na porta TCP `3200` (`NICE_GUARITA_EVENT_PORT`) por conexões ativas ou adaptadores seriais-IP vindos do módulo MG3000.
*   **Frames de Acesso (Auto Event):** MG3000 empurra pacotes binários de 20 bytes contendo serial do dispositivo acionado, tipo do leitor e sentido do acesso.
*   **Comandos de Comunicação Cliente:** Conexão direta TCP para comandos específicos:
    *   `Cmd 70 (0x46) - READ_DEVICES`: Leitura progressiva da base de dispositivos cadastrados.
    *   `Cmd 67 (0x43) - ENROLL_DEVICE`: Cadastro e deleção de novos transmissores ou cartões.
    *   `Cmd 13 (0x0D) - TRIGGER_OUTPUT`: Acionamento de relés de saída para abertura remota de portões.
    *   `Cmd 43 (0x2B) - CANCEL_PROGRESSIVE`: Cancela transmissões em lote.
*   **Anti-Passback (Anti-Passagem Dupla):** Mantém o estado dinâmico de tráfego (`IN` / `OUT`) dos moradores e prestadores e bloqueia acionamentos duplicados sem a saída correspondente, emitindo alertas imediatos via WebSocket para a tela do operador.

### C. Vídeo Porteiros Hikvision (ISAPI Direct HTTP)
*   **Comunicação:** Conexão direta via requisições HTTP na rede local do condomínio usando autenticação **Digest Auth (RFC 2617)** baseada em MD5 com fallback automático para **Basic Auth**.
*   **Endpoint de Imagem:** Acesso direto ao frame do streaming para exibição rápida:
    *   `/ISAPI/Streaming/channels/1/picture` (e variações como sub-canais 101, 102, channel 2).
    *   `/ISAPI/System/deviceInfo` para verificação de status e health-check do hardware.

---

## 6. Funcionalidades de Negócio

1.  **Gestão de Moradores (Persons):** Cadastro de moradores associados a torres, blocos, apartamentos, vagas de garagem e seus respectivos dispositivos físicos (placas de veículos, cartões RFID e seriais de controles de garagem TX).
2.  **Portal e Cadastro de Visitantes:** Permite pré-cadastro de visitas com horários agendados de início e fim, verificação do termo de conformidade LGPD e vinculação de convites.
3.  **Controle de Encomendas (Deliveries):** Registro de encomendas recebidas na portaria com status (`awaiting` - aguardando retirada, `picked_up` - retirado, `returned` - devolvido), foto do pacote, operador receptor e assinatura do morador que retirou.
4.  **Prestadores de Serviços (Providers):** Controle temporário ou recorrente de prestadores vinculados a unidades condominiais, incluindo datas de vigência do contrato e restrição de acesso a áreas específicas.
5.  **Central de Eventos Unificada:** Consolidação em tempo real de logs do HikCentral, acionamentos Nice Guarita (controles de garagem), QR Codes e registros manuais.
6.  **Painel de Segurança e Métricas de Login:** Rastreabilidade de logins malsucedidos, detecção de ataques de força bruta, restrição de IPs e snapshots de segurança automáticos.
7.  **RBAC (Role-Based Access Control):** Permissões personalizáveis por cargo de usuário (`admin_master`, `operator`, `security_team`) protegendo rotas administrativas, backups e logs de auditoria.

---

## 7. Infraestrutura, Operação e Scripts

O sistema possui uma rica suíte de scripts Bash e utilitários localizados em `/opt/access-control-system/scripts` para apoiar a manutenção diária do condomínio.

### Gerenciador do Stack Docker (`ops.sh`)
Centraliza as operações comuns de infraestrutura:
*   `./scripts/ops.sh up`: Inicia todo o stack de containers.
*   `./scripts/ops.sh ps`: Lista o status e a saúde dos containers.
*   `./scripts/ops.sh health`: Realiza health-check de resposta HTTPS na porta 8443.
*   `./scripts/ops.sh cert 365`: Regenera o certificado TLS autoassinado.
*   `./scripts/ops.sh smoke`: Executa teste de fumaça simulando um fluxo completo de login, refresh de token, chamadas autenticadas e logout.

### Banco de Dados e Backups
*   **Criação de Backups:** `./scripts/ops.sh backup-db` gera dumps criptografados do banco PostgreSQL salvos em `/opt/access-control-system/backups` mantendo um histórico rotativo de 15 arquivos.
*   **Verificação de Integridade:** `./scripts/ops.sh backup-verify` limpa o banco de teste temporário e valida se o último backup gerado pode ser restaurado sem falhas.
*   **Restauração:** `./scripts/ops.sh restore-db [caminho_do_dump] --yes` executa a restauração destrutiva do banco de produção a partir de um backup selecionado.

### Monitoramento e Tarefas Agendadas (Cron)
O script `./scripts/ops.sh cron-install` instala na crontab do host as tarefas automatizadas do sistema:
*   **Monitoramento (a cada 5 min):** Roda testes rápidos de conexão e envia alertas a canais webhook (`ALERT_WEBHOOK_URL`) em caso de indisponibilidade física ou lógica.
*   **Backup Automatizado (a cada 6 horas):** Executa dumps incrementais do banco de dados.
*   **Pruning de Dados (diário):** Limpa sessões expiradas no banco (`prune-refresh-sessions.sh`) e remove snapshots de métricas de segurança antigos com mais de 30 dias.
*   **Rotação de Credenciais de Ops (semanal):** Modifica e rotaciona as credenciais de segurança do endpoint `/ops/status.json` salvando os novos acessos no arquivo `/etc/nginx/auth/ops-current-credentials.txt`.
