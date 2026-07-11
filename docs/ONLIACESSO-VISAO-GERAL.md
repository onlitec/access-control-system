# OnliAcesso — Documento Técnico de Visão Geral

**Versão do software:** 1.0.0-alpha · **Última atualização deste documento:** 06/07/2026

Sistema de controle de acesso condominial **100% standalone e autossuficiente**: todos os dados residem em um banco PostgreSQL local, sem dependência de nenhuma plataforma externa (HikCentral, Artemis ou similares). A integração com o hardware é feita **diretamente nos equipamentos da rede local** — módulo de guarita Nice/Linear-HCS MG3000 via protocolo TCP binário próprio e videoporteiros Hikvision via ISAPI/RTSP.

---

## 1. Arquitetura

### 1.1 Visão de alto nível

```
                                ┌─────────────────────────────┐
   Navegadores / celulares ───▶ │  nginx (porta 80) — proxy   │
                                └──────┬──────────────────────┘
              ┌────────────────────────┼───────────────────────────┐
              ▼                        ▼                           ▼
   /painel, /  (SPA React)   /admin  (SPA React)        /login (Next.js SSR)
   frontend-access           frontend-admin             frontend-visitor
   [porta interna 5101]      [porta interna 5102]       [porta interna 5100]
              │                        │                           │
              └───────────────► /api ◄─┴───────────────────────────┘
                                  │
                       ┌──────────▼──────────┐        ┌──────────────────────┐
                       │  backend-api        │◄──────▶│ PostgreSQL local     │
                       │  Express + Prisma   │        │ (banco onliacesso)   │
                       │  [porta 3001]       │        └──────────────────────┘
                       └───────┬──────┬──────┘
              TCP 9000 (Nice)  │      │  HTTP/RTSP (ISAPI + ffmpeg)
                       ┌───────▼──┐ ┌─▼──────────────────┐
                       │ MG3000   │ │ Videoporteiros     │
                       │ (guarita)│ │ Hikvision DS-KB/KV │
                       └──────────┘ └────────────────────┘
```

### 1.2 Aplicações

| Aplicação | Papel | Tecnologia | Rota pública (nginx) |
|---|---|---|---|
| **backend-api** | API REST, regras de negócio, integrações de hardware | Node.js 20 + Express 4 + Prisma 5 (TypeScript) | `/api/*` |
| **frontend-access** | Painel da portaria/operacional (o app principal) | React 18 + Vite (rolldown) + Tailwind + shadcn/ui | `/` e `/painel/*` |
| **frontend-admin** | Painel administrativo | React 18 + Vite 5 | `/admin/*` |
| **frontend-visitor** | Onboarding de moradores/visitantes, login por link | Next.js 16 (standalone SSR) | `/login/*` |

### 1.3 Serviços Windows (instalação de produção)

A instalação em produção (`C:\OnliAcesso`) roda 6 serviços gerenciados pelo WinSW v3:

| Serviço | Conteúdo |
|---|---|
| `onliacesso-postgres` | PostgreSQL local (porta 5432) |
| `onliacesso-api` | backend-api (porta 3001) — PATH inclui ffmpeg e Node empacotados |
| `onliacesso-access` | frontend-access servido estático (serve-static.js) |
| `onliacesso-admin` | frontend-admin servido estático |
| `onliacesso-visitor` | frontend-visitor (Next standalone) |
| `onliacesso-proxy` | nginx na porta 80 (roteamento acima) |

### 1.4 Princípio standalone (regra de projeto)

**Nenhum endpoint de dados consulta sistema externo.** Moradores, visitantes, prestadores, staff, eventos de acesso, dispositivos, fotos (data-URIs base64 no banco) e embeddings faciais vêm exclusivamente do PostgreSQL local via Prisma. Código legado de integração HikCentral existe dormente no repositório (`HikCentralService`), mas está bloqueado por uma verificação central (`isConfigured()`), e os fluxos de listagem/cadastro não o invocam. O HikCentral pode existir na infraestrutura do condomínio para outras finalidades — o OnliAcesso não se comunica com ele.

---

## 2. Estrutura do repositório

```
access-control-system/
├── backend-api/
│   ├── src/
│   │   ├── index.ts             # bootstrap Express, rotas inline legadas, middleware auth
│   │   ├── server.ts            # entrypoint: sobe API + hub de eventos da guarita
│   │   ├── controllers/         # Dashboard, Residents, Staff, ServiceProviders, Visitors,
│   │   │                        # Auth, Setup, Terminal, AdminEntities, Security, Audit...
│   │   ├── routes/              # guarita, doorbell, events, deliveries, onboarding,
│   │   │                        # resident-auth, access-areas, condominium, setup...
│   │   ├── services/            # NiceGuaritaProtocol/Service, VideoDoorbellService,
│   │   │                        # DeviceStatusService, EmailService, FaceMatchService,
│   │   │                        # EventBusService, EntityMappingService, AuditService...
│   │   ├── middleware/          # authMiddleware (JWT), adminMiddleware, portariaMiddleware
│   │   └── prisma/ → ../prisma  # schema.prisma (32 modelos) + migrations
│   └── dist/                    # build tsc (CommonJS)
├── frontend-access/             # SPA principal (React+Vite), src/pages + src/components
├── frontend-admin/              # SPA admin (React+Vite)
├── frontend-visitor/            # Next.js (output: standalone)
├── installer/
│   ├── build-package-windows-native.sh  # build oficial 100% nativo (Git Bash + ISCC)
│   ├── windows/OnliAcesso.iss           # script Inno Setup 6
│   ├── windows/scripts/install.ps1      # instalação silenciosa (serviços, banco, .env)
│   └── dist/OnliAcessoSetup-<versão>.exe
├── sdk-nice/                    # SDK/demo C# oficial do MG3000 (referência do protocolo)
└── docs/                        # documentação (este arquivo)
```

### 2.1 Banco de dados (Prisma — 32 modelos)

Núcleo: `Person` (moradores/staff/prestadores — inclui `is_owner`, `is_resident`, `txSerial`, `cardSerial`, foto base64), `Visitor`, `ServiceProvider`, `AccessEvent` (feed unificado de eventos), `User`/`RefreshSession` (operadores do sistema), `Unit`/`Block`/`Tower` (estrutura física do condomínio).

Hardware: `GuaritaDevice` (portões — IP/porta do módulo + `sdkConfig {relayOutput, direction, deviceType, deviceNum}`), `DoorbellDevice` (videoporteiros), `GuaritaPassbackState`/`GuaritaPassbackAlert` (anti-passback).

Suporte: `Delivery` (encomendas), `AccessArea`/`ResidentAccessArea`, `Department`, `CondominiumSettings`, `SystemSettings`, `RolePermission`, `SessionAuditEvent`/`AdminAuditEvent`, `SecurityMetricSnapshot`, `OnboardingFaceVerification`, `Blacklist`, `BackupRun`.

---

## 3. Tecnologias

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20 (empacotado no instalador; serviço não usa Node do host) |
| API | Express 4, TypeScript, Helmet, CORS, cookie-parser, rate limiting |
| ORM/BD | Prisma 5 + PostgreSQL (empacotado) |
| Autenticação | JWT (access token) + refresh tokens rotacionados com hash SHA-256 no banco; sessões limitadas por usuário; bcryptjs para senhas |
| Reconhecimento facial | @vladmandic/face-api + TensorFlow.js (backend WASM) + canvas — matching local de selfie × documento no onboarding |
| E-mail | nodemailer via SMTP (Brevo) — verificação de e-mail no primeiro cadastro |
| Vídeo | ffmpeg (empacotado): RTSP → MJPEG ao vivo e snapshot de 1 frame |
| Frontends | React 18, Vite, TailwindCSS, shadcn/ui, lucide-react; Next.js 16 no visitor |
| Proxy | nginx (empacotado) |
| Serviços Windows | WinSW v3 |
| Instalador | Inno Setup 6 (build nativo via `build-package-windows-native.sh`), assinatura Authenticode |

---

## 4. Integrações de hardware (diretas, sem intermediários)

### 4.1 Nice/Linear-HCS MG3000 (guarita) — TCP porta 9000

Protocolo binário próprio (frame `0x00 + CMD + payload + checksum`), implementado em `NiceGuaritaProtocol.ts` a partir do SDK C# oficial e validado no hardware real. Particularidades tratadas:

- **Uma conexão TCP persistente por módulo** (`GuaritaConnection`): o MG3000 atende uma conexão por vez e nunca a fecha após responder — comandos são serializados em fila e as respostas reconhecidas por tamanho/checksum; reconexão automática com backoff.
- **Eventos em tempo real (Cmd 4)** chegam pela mesma conexão persistente (`GuaritaEventHub` mantém uma conexão por módulo habilitado no banco).
- **Leitura progressiva (Cmd 70)** com ACK de 1 byte `0x00` por frame — importação da memória do módulo.
- **Seriais canônicos**: controle TX = 7 dígitos hex (nibble alto incluso), demais tipos 6 dígitos, sempre com zeros à esquerda — mesmo formato dos eventos, garantindo a identificação do morador no acionamento.
- **Múltiplos portões por módulo**: cada portão é um `GuaritaDevice` com o mesmo IP e `relayOutput` distinto (ex.: relé 1 = Entrada Moradores, relé 2 = Entrada Visitantes, relé 3 = Saída); o evento carrega qual relé atuou e é correlacionado ao portão certo, com direção entrada/saída.

Comandos implementados: acionar relé (13), ler/gravar relógio (12/11), contagem de dispositivos (7), cadastrar/excluir dispositivo (67), atualizar receptores (29), leitura progressiva (70/43).

### 4.2 Videoporteiros Hikvision (DS-KB/DS-KV) — ISAPI + RTSP

- **Vídeo ao vivo**: RTSP (sub-stream 102) transcodificado para MJPEG via ffmpeg com flags de baixa latência; fallback para polling de snapshots ISAPI.
- **Snapshot**: captura de 1 frame do RTSP via ffmpeg (as door stations DS-KB não implementam o `/picture` do ISAPI); fallback ISAPI para modelos que suportam.
- **Autenticação**: Digest MD5 (RFC 2617) implementada manualmente, com fallback Basic.
- **Status online/offline**: checagem ISAPI `deviceInfo` (aparelho que responde — mesmo 401 — conta como online).

---

## 5. Funcionalidades

### 5.1 Painel da portaria (frontend-access)

- **Dashboard**: cartões em tempo real (moradores, proprietários, visitas ativas, acessos hoje com comparativo vs ontem, dispositivos online/offline, encomendas), gráfico de acessos por hora, feed de eventos ao vivo (SSE) e **controle de portão** — botões Abrir/Fechar para cada um dos portões cadastrados.
- **Moradores**: cadastro completo (dados pessoais, CPF/RG, foto facial e do documento via câmera, unidade em cascata Torre→Quadra→Unidade, vagas, placa, serial do cartão/tag e **serial do controle TX**), classificação **Proprietário do Imóvel** e **Reside no Condomínio** independentes (proprietário não-residente não conta como morador nos indicadores), níveis de acesso, geração de link de onboarding, edição, exclusão e busca. Cadastro do controle no morador **sincroniza automaticamente com a memória do MG3000**.
- **Visitantes**: pré-registro com convite por link único (o visitante completa os próprios dados + foto), visitas ativas e concluídas com dados reais (status derivado da janela de tempo), checagem de blacklist.
- **Prestadores de serviço**: fixos e temporários, do condomínio ou de morador, com períodos de atividade.
- **Staff/Portaria**: cadastro da equipe.
- **Encomendas**: registro e baixa de entregas com aviso ao morador.
- **Central de Eventos**: feed unificado paginado com filtros (categoria acesso/portão/alarme/entrega/sistema, direção, origem, status, busca), atualização ao vivo via SSE.
- **Acessos Hoje**: resumo do dia (total, autorizados, negados, entradas/saídas) com tabela filtrável.
- **Relatório de Eventos**: histórico completo com filtros avançados e exportação CSV.
- **Status dos Dispositivos**: verificação real por aparelho (videoporteiros via ISAPI, MG3000 via protocolo Nice).
- **Videoporteiros**: cadastro (IP/credenciais), vídeo ao vivo MJPEG, snapshot, teste de conexão.
- **Guarita MG3000**: cadastro dos módulos/portões (IP, porta, relé, direção), ping com contagem de dispositivos e relógio, descoberta na rede, **importação dos controles da memória do módulo para o banco** (cria/mescla moradores), cadastro e exclusão de controle no módulo com atualização dos receptores.
- **Anti-passback** (opcional, por configuração): bloqueia segunda entrada sem registro de saída, com alerta em tempo real para a portaria.
- **Usuários do sistema**: operadores com papéis (ADMIN, PORTARIA etc.) e permissões granulares por papel.
- **Autoatendimento do morador**: portal do morador com senha própria.

### 5.2 Registro e captura de acionamentos (guarita)

Todo evento do MG3000 vira um registro na Central de Eventos, em tempo real:

- **Acionamento por controle do morador**: identifica o morador pelo serial (formato canônico), registra entrada/saída no portão correto com foto e unidade; serial desconhecido gera evento "Controle não cadastrado" (negado).
- **Acionamento pelo sistema** (botão no dashboard): registra "Portão aberto/fechado manualmente" com o operador; o eco de confirmação do módulo é reconhecido e não duplica evento.
- **Acionamento pela console física da portaria**: evento próprio na categoria portão.
- **Alarmes**: pânico e tentativa de clonagem de controle geram eventos de alarme.
- Dedupe de rajadas (mesmo serial em <5 s é ignorado).

### 5.3 Onboarding do morador (frontend-visitor)

Link único enviado ao morador → confirmação de CPF → captura de selfie → **verificação facial local** (face-api/TensorFlow, sem nuvem) comparando com a foto do documento → ativação do acesso.

### 5.4 Primeiro uso e administração

- **Primeiro cadastro**: na primeira execução, a tela `/setup` cria o administrador inicial com verificação de e-mail por código de 6 dígitos (SMTP Brevo).
- **Painel admin**: configurações do condomínio (torres/quadras/unidades), áreas de acesso, requisitos de cadastro, auditoria de sessões e ações administrativas, métricas de segurança com snapshots históricos, backups.
- **Segurança**: Helmet, rate limiting nos logins, refresh tokens rotacionados, limite de sessões ativas, auditoria de login/logout, senhas bcrypt.

### 5.5 Instalador Windows

Instalador único (`OnliAcessoSetup-<versão>.exe`, Inno Setup, assinado) que embute PostgreSQL, Node.js 20, nginx, ffmpeg e WinSW; a instalação cria os 6 serviços, inicializa o banco (migrações Prisma), gera segredos/credenciais e configura SMTP — sem exigir nenhuma dependência pré-instalada na máquina. Build documentado e reproduzível via `installer/build-package-windows-native.sh`.

---

## 6. Limitações conhecidas / pendências (06/07/2026)

1. **Acionamento físico dos portões**: a cadeia software→módulo está validada (o MG3000 aceita e confirma os comandos), mas o módulo reporta falha ao atualizar os receptores no barramento CAN — os relés do receptor Linear-HCS TX-4A não atuam. Pendente verificação física: cabeamento CAN, endereço do receptor e modo de operação (integrado × autônomo).
2. **TLS**: a plataforma serve HTTP na porta 80 (geração de certificado no instalador foi revertida; pendente para versão futura).
3. **Código legado HikCentral**: serviços dormentes mantidos no repositório; candidatos a remoção definitiva em limpeza futura.
