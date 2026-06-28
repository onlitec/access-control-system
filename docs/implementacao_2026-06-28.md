# Implementação: Independência de Provedor, Portal do Morador e Novas Integrações

**Data:** 2026-06-28  
**Versão:** 2.0  
**Autor:** Antigravity AI

---

## Contexto

O sistema foi originalmente desenvolvido com acoplamento exclusivo ao HikCentral via API (Artemis Gateway). Esta implementação tornou o sistema **independente de provedor externo**, mantendo o HikCentral como integração opcional, e adicionou suporte a:

- Módulo Nice Guarita IP (stub preparado para SDK)
- Videoporteiro Hikvision (ISAPI direto)
- Portal autenticado do morador para pré-cadastro de visitantes e prestadores

---

## Diagnóstico Inicial

| Problema | Estado Anterior | Estado Atual |
|---|---|---|
| HikCentral obrigatório | Sistema não subia sem configuração HikCentral | Opcional; fallback automático para LocalProvider |
| Portal do morador `/login` | Página pública sem autenticação | Portal autenticado (CPF + telefone) |
| Pré-cadastro de visitantes | Dentro do painel da portaria `/painel/setup` | Portal do morador `/login/pre-register` |
| Videoporteiro | Apenas via API HikCentral | ISAPI direto com dispositivo Hikvision |
| Nice Guarita IP | Ausente | Stub completo aguardando SDK |
| Página de integrações | Ausente | `/admin/integrations` com CRUD completo |

---

## Épico 1 — Camada de Abstração de Provedor

### Objetivo
Sistema funciona sem qualquer ACS externo; HikCentral vira uma implementação plugável.

### Arquitetura

```
src/providers/
├── types.ts                    DTOs genéricos compartilhados entre provedores
├── IAccessControlProvider.ts   Interface do contrato de provedor
├── LocalProvider.ts            Modo standalone (só PostgreSQL via Prisma)
├── HikCentralProvider.ts       Adapter que delega ao HikCentralService
├── NiceGuaritaProvider.ts      Stub Nice Guarita (isAvailable=false)
└── ProviderFactory.ts          Factory de instanciação via variável de ambiente
```

### Interface `IAccessControlProvider`

```typescript
interface IAccessControlProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  addPerson(data: PersonInput): Promise<string>;
  updatePerson(externalId: string, data: PersonInput): Promise<void>;
  getPersons(filter: PersonFilter): Promise<ExternalPerson[]>;
  addPersonFace(externalId: string, faceBase64: string): Promise<void>;
  authorizePersonAccess(externalId: string, levelCodes: string[]): Promise<void>;
  getPersonAccessLevels(externalId: string): Promise<string[]>;
  createVisitor(data: VisitorInput): Promise<string>;
  listVisitors(groupName: string): Promise<ExternalVisitor[]>;
  getAccessLogs(params: AccessLogParams): Promise<AccessLogEntry[]>;
  getDevices(): Promise<Device[]>;
  captureDevicePhoto(deviceId: string): Promise<Buffer | null>;
  getOrganizations(): Promise<Org[]>;
  getAccessLevels(): Promise<AccessLevel[]>;
}
```

### ProviderFactory

Controla o provedor ativo via variável de ambiente `PROVIDER_TYPE`:

```bash
PROVIDER_TYPE=local        # modo standalone (padrão)
PROVIDER_TYPE=hikcentral   # integração HikCentral
```

Na inicialização do servidor (`src/server.ts`) é chamado `initProviders()`, que instancia o provedor correto e registra no log:

```
[ProviderFactory] Primary provider: Local (standalone)
```

### Graceful Degradation

As rotas de criação de morador (`POST /api/residents`) e conclusão de convite (`POST /api/invites/complete`) foram refatoradas para tolerar ausência do HikCentral:

- Registro criado no banco local primeiro
- Sincronização com HikCentral tentada em bloco `try/catch`
- Falha no HikCentral gera `console.warn`, não quebra a operação
- Foto salva localmente independente da integração

### Novos modelos Prisma

```prisma
model IntegrationConfig {
  id           String   @id @default(cuid())
  providerType String   // "hikcentral" | "local" | "nice_guarita"
  enabled      Boolean  @default(false)
  config       Json
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model ResidentSession {
  id        String   @id @default(cuid())
  personId  String
  person    Person   @relation(fields: [personId], references: [id])
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
}

model DoorbellDevice {
  id        String   @id @default(cuid())
  name      String
  ip        String
  port      Int      @default(80)
  username  String
  password  String
  location  String?
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
}

model GuaritaDevice {
  id        String   @id @default(cuid())
  name      String
  ip        String
  port      Int      @default(80)
  location  String?
  enabled   Boolean  @default(true)
  sdkConfig Json?
  createdAt DateTime @default(now())
}
```

Também adicionados:
- `Person.externalId String?` — ID genérico em provedores externos
- `Visitor.externalId String?` — ID genérico em provedores externos

**Migração:** `prisma/migrations/20260628000001_add_provider_abstraction/migration.sql`

---

## Épico 2 — Portal do Morador em `/login`

### Objetivo
`/login` torna-se portal autenticado onde o morador gerencia pré-cadastros de visitantes e prestadores.

### Autenticação do Morador

Método: **CPF + telefone cadastrado** (campos já existentes no model `Person`)  
Token: JWT com `{ type: 'resident', personId, sessionToken }`  
Armazenamento: `localStorage.resident_token` no browser; `ResidentSession` no banco

### Rotas Backend

**Arquivo:** `backend-api/src/routes/resident-auth.routes.ts`  
**Prefixo:** `/api/resident`

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | Valida CPF+telefone, retorna JWT de sessão |
| POST | `/auth/logout` | Invalida sessão |
| GET | `/auth/me` | Dados do morador autenticado |
| GET | `/visitors` | Lista visitantes do morador |
| POST | `/visitors/pre-register` | Pré-cadastra visitante, retorna link de convite |
| GET | `/providers` | Lista prestadores do morador |
| POST | `/providers/pre-register` | Pré-cadastra prestador de serviço |

### Páginas Frontend (`frontend-visitor/` — Next.js)

| Rota | Tipo | Descrição |
|---|---|---|
| `/login` | Público | Página inicial: Sou Morador / Tenho um Convite / Primeiro Acesso |
| `/login/auth` | Público | Formulário de login (CPF + telefone com máscara) |
| `/login/dashboard` | **Autenticado** | Dashboard: abas Visitantes e Prestadores, contadores, botões de pré-cadastro |
| `/login/pre-register` | **Autenticado** | Formulário de pré-cadastro de visitante ou prestador |
| `/login/first-access` | Público (token) | Onboarding inicial do morador (mantido) |
| `/login/guest-complete` | Público (token) | Visitante completa cadastro via link gerado pelo morador (mantido) |

### API Client

**Arquivo:** `frontend-visitor/src/lib/residentApi.ts`

Funções exportadas:
- `loginResident(cpf, phone)` — autenticação
- `logoutResident()` — logout
- `getMe()` — dados do morador
- `getMyVisitors()` — lista de visitantes
- `preRegisterVisitor(data)` — pré-cadastro + geração de link
- `getMyProviders()` — lista de prestadores
- `preRegisterProvider(data)` — pré-cadastro de prestador

---

## Épico 3 — Videoporteiro Hikvision (ISAPI Direto)

### Objetivo
Porteiros podem capturar foto do visitante diretamente do videoporteiro Hikvision DS-KV no momento do registro.

### Como Funciona

O sistema acessa o videoporteiro via HTTP diretamente na rede local usando a API ISAPI da Hikvision:

```
GET http://<ip>:<porta>/ISAPI/Streaming/channels/1/picture
Authorization: Basic base64(usuario:senha)
```

A resposta é um buffer JPEG que o backend repassa ao frontend como `Content-Type: image/jpeg`.

### Serviço Backend

**Arquivo:** `backend-api/src/services/VideoDoorbellService.ts`

| Método | Descrição |
|---|---|
| `getSnapshot(deviceId)` | Captura foto JPEG do videoporteiro (timeout 8s) |
| `getDeviceInfo(deviceId)` | Lê info do dispositivo via ISAPI XML (timeout 5s) |
| `testConnection(ip, port, user, pass)` | Testa alcançabilidade (aceita HTTP 401 como "alcançável") |
| `listDevices()` | Lista dispositivos habilitados do banco |

### Rotas Backend

**Arquivo:** `backend-api/src/routes/doorbell.routes.ts`  
**Prefixo:** `/api/doorbell` (requer autenticação admin/painel)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/devices` | Lista dispositivos (sem senhas na resposta) |
| POST | `/devices` | Cadastra novo dispositivo |
| PUT | `/devices/:id` | Atualiza dispositivo (nome, IP, porta, enabled) |
| DELETE | `/devices/:id` | Remove dispositivo |
| GET | `/devices/:id/snapshot` | Retorna JPEG do snapshot |
| GET | `/devices/:id/info` | Info do dispositivo via ISAPI |
| POST | `/test` | Testa conexão sem salvar |

### Componente Frontend (Portaria)

**Arquivo:** `frontend-access/src/components/DoorbellCapture.tsx`

- Busca lista de dispositivos no mount; renderiza nada se não houver dispositivos
- Com um dispositivo: exibe label do nome; com múltiplos: dropdown de seleção
- Botão "Capturar" → faz fetch do snapshot, converte para data URL via FileReader
- Preview com overlay "Foto usada" e botão "Nova" para recapturar
- Chama `onCapture(dataUrl)` ao capturar — integrado no campo de foto do formulário de visitantes

**Integração:** `frontend-access/src/pages/VisitorsPage.tsx`

---

## Épico 4 — Nice Guarita IP (Stub)

### Objetivo
Arquitetura preparada para integração com módulo de controle de portão Nice Guarita IP. SDK solicitado, aguardando recebimento.

### Serviço Backend

**Arquivo:** `backend-api/src/services/NiceGuaritaService.ts`

```typescript
class ServiceUnavailableError extends Error {
  code = 'SDK_UNAVAILABLE';
}

class NiceGuaritaService {
  static isSdkAvailable(): boolean { return false; }
  static async openGate(deviceId): Promise<void>   { throw new ServiceUnavailableError(); }
  static async closeGate(deviceId): Promise<void>  { throw new ServiceUnavailableError(); }
  static async getGateStatus(deviceId): Promise<'unknown'> { return 'unknown'; }
  static async listDevices(): Promise<GuaritaDevice[]> { /* Prisma query */ }
}
```

### Rotas Backend

**Arquivo:** `backend-api/src/routes/guarita.routes.ts`  
**Prefixo:** `/api/guarita`

| Método | Rota | Resposta |
|---|---|---|
| GET | `/status` | `{ sdkAvailable: false, message: "..." }` |
| GET | `/devices` | Lista de dispositivos + flag sdkAvailable |
| POST | `/devices` | Cadastra dispositivo |
| PUT | `/devices/:id` | Atualiza dispositivo |
| DELETE | `/devices/:id` | Remove dispositivo |
| POST | `/devices/:id/open` | **503** `{ error: "...", code: "SDK_UNAVAILABLE" }` |
| POST | `/devices/:id/close` | **503** |
| GET | `/devices/:id/status` | `{ status: "unknown" }` |

### Componente Frontend (Portaria)

**Arquivo:** `frontend-access/src/components/GateControl.tsx`

- Busca dispositivos no mount; renderiza nada se lista vazia
- Exibe banner âmbar quando `sdkAvailable === false`
- Botões Abrir/Fechar desabilitados até SDK disponível
- Feedback por dispositivo (mensagem de erro ou confirmação)

**Integração:** `frontend-access/src/pages/DashboardPage.tsx`

### Ativação Futura

Quando o SDK Nice Guarita IP for recebido, implementar em `NiceGuaritaService.ts`:

```typescript
static isSdkAvailable(): boolean { return true; } // mudar para true
static async openGate(deviceId: string): Promise<void> {
  // implementar chamada SDK aqui
}
```

Os botões no frontend se ativarão automaticamente sem necessidade de alteração.

---

## Épico 5 — Admin: Página de Configuração de Integrações

### Objetivo
Administrador configura todas as integrações via interface web, sem precisar editar variáveis de ambiente.

### Página

**Arquivo:** `frontend-admin/src/pages/IntegrationsPage.tsx`  
**Rota:** `/admin/integrations`  
**Menu:** Administração → Integrações (ícone Plug)

### Seções da Página

#### HikCentral ACS
- Campo URL da API (ex: `https://10.0.0.1`)
- Campo App Key
- Campo App Secret (com toggle mostrar/ocultar)
- Checkbox "Sincronização automática habilitada"
- Botão "Salvar HikCentral"
- Feedback visual (verde = salvo, vermelho = erro)

#### Videoporteiros Hikvision (ISAPI)
- Lista de dispositivos cadastrados com status ativo/inativo e botão remover
- Botão "Adicionar" abre formulário inline com campos: Nome, IP, Porta, Usuário, Senha, Localização
- Botão "Testar Conexão" valida o dispositivo antes de salvar
- Toggle ativar/desativar por dispositivo

#### Nice Guarita IP
- Badge "SDK Pendente" quando SDK não disponível
- Banner informativo explicando que o cadastro já pode ser feito
- Lista de dispositivos cadastrados
- Formulário inline: Nome, IP, Porta, Localização

---

## Infraestrutura — Mudanças no Backend

### Registro de Rotas (`backend-api/src/index.ts`)

```typescript
app.use('/api/resident',  residentAuthRoutes);
app.use('/api/doorbell',  doorbellRoutes);
app.use('/api/guarita',   guaritaRoutes);
```

### Inicialização (`backend-api/src/server.ts`)

```typescript
initProviders(); // chama antes de app.listen()
```

Log de startup confirma provedor ativo:
```
[ProviderFactory] Primary provider: Local (standalone)
```

---

## Arquitetura de URLs

| URL | Serviço | Público | Autenticação |
|---|---|---|---|
| `/admin/*` | frontend-admin | Não | JWT admin |
| `/painel/*` | frontend-access | Não | JWT portaria |
| `/login` | frontend-visitor | Sim | — |
| `/login/auth` | frontend-visitor | Sim | — |
| `/login/dashboard` | frontend-visitor | Não | JWT morador |
| `/login/pre-register` | frontend-visitor | Não | JWT morador |
| `/login/first-access` | frontend-visitor | Sim (token URL) | — |
| `/login/guest-complete` | frontend-visitor | Sim (token URL) | — |
| `/api/*` | backend-api | Varia por rota | JWT |

---

## Configuração de Ambiente

### Variáveis Relevantes

| Variável | Valores | Padrão | Descrição |
|---|---|---|---|
| `PROVIDER_TYPE` | `local`, `hikcentral` | `local` | Provedor de acesso ativo |
| `DATABASE_URL` | string PostgreSQL | obrigatório | Conexão com banco |
| `JWT_SECRET` | string | obrigatório | Assinatura de tokens JWT |
| `APP_URL` | URL | obrigatório | URL pública do sistema |

### Configurações via Interface

As configurações de integrações (HikCentral API key, dispositivos, etc.) são gerenciadas em `/admin/integrations` e persistidas no banco de dados — não requerem variáveis de ambiente.

---

## Deployment

### Build e Deploy

```bash
# Da raiz do monorepo
docker compose build
docker compose up -d
```

### Migração do Banco

```bash
cd backend-api
npx prisma migrate deploy
```

A migração `20260628000001_add_provider_abstraction` adiciona:
- Tabelas: `integration_configs`, `resident_sessions`, `doorbell_devices`, `guarita_devices`
- Colunas: `external_id` em `persons` e `visitors`
- Seeds: 3 registros padrão em `integration_configs` (hikcentral desabilitado, local habilitado, nice_guarita desabilitado)

### Healthchecks

Todos os serviços possuem healthcheck configurado no Docker Compose. O nginx (proxy) só sobe após todos os outros estarem `healthy`.

```bash
docker compose ps  # verifica status
```

---

## Fluxos Operacionais

### Fluxo 1: Registro de Visitante com Foto do Videoporteiro

1. Porteiro abre `/painel/visitors` → formulário de novo visitante
2. Seção de foto exibe dropdown de videoporteiros (se houver cadastrados)
3. Porteiro seleciona dispositivo → clica "Capturar"
4. Backend faz `GET /ISAPI/Streaming/channels/1/picture` no dispositivo
5. Foto é exibida como preview no formulário
6. Porteiro confirma e finaliza o cadastro com a foto capturada

### Fluxo 2: Morador Pré-cadastra Visitante

1. Morador acessa `https://host/login` → clica "Sou Morador"
2. Formulário CPF + telefone → valida contra base de moradores
3. Dashboard exibe visitantes agendados e prestadores cadastrados
4. Clica "Pré-cadastrar Visitante" → preenche nome, contato, finalidade, validade
5. Sistema gera link único de convite
6. Morador compartilha link com o visitante via WhatsApp/e-mail
7. Visitante abre o link → `/login/guest-complete?token=...`
8. Visitante preenche dados complementares e foto
9. Portaria recebe visitante com cadastro já aprovado pelo morador

### Fluxo 3: Controle de Portão (futuro — aguarda SDK)

1. Admin cadastra módulo Guarita em `/admin/integrations`
2. Dashboard da portaria exibe seção "Controle de Portão"
3. Porteiro clica "Abrir" → SDK Nice Guarita aciona módulo físico
4. Status do portão atualizado em tempo real

---

## Arquivos Criados/Modificados

### Backend (`backend-api/`)

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/providers/types.ts` | Novo | DTOs genéricos de provedor |
| `src/providers/IAccessControlProvider.ts` | Novo | Interface do contrato |
| `src/providers/LocalProvider.ts` | Novo | Modo standalone |
| `src/providers/HikCentralProvider.ts` | Novo | Adapter HikCentral |
| `src/providers/NiceGuaritaProvider.ts` | Novo | Stub Nice Guarita |
| `src/providers/ProviderFactory.ts` | Novo | Factory de instanciação |
| `src/services/VideoDoorbellService.ts` | Novo | ISAPI Hikvision |
| `src/services/NiceGuaritaService.ts` | Novo | Stub SDK Guarita |
| `src/routes/resident-auth.routes.ts` | Novo | Auth + pré-cadastro morador |
| `src/routes/doorbell.routes.ts` | Novo | CRUD + snapshot videoporteiro |
| `src/routes/guarita.routes.ts` | Novo | CRUD + controle portão (stub) |
| `src/server.ts` | Modificado | Chama `initProviders()` |
| `src/index.ts` | Modificado | Registra 3 novas rotas; graceful degradation HikCentral |
| `prisma/schema.prisma` | Modificado | 4 novos modelos, 2 novos campos |
| `prisma/migrations/20260628000001_*/migration.sql` | Novo | SQL da migração |

### Frontend Admin (`frontend-admin/`)

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/pages/IntegrationsPage.tsx` | Novo | Página de configuração de integrações |
| `src/App.tsx` | Modificado | Rota `/admin/integrations` |
| `src/components/AdminLayout.tsx` | Modificado | Item "Integrações" no menu |
| `src/services/api.ts` | Modificado | Exporta `apiFetch` |

### Frontend Portaria (`frontend-access/`)

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/components/DoorbellCapture.tsx` | Novo | Captura foto do videoporteiro |
| `src/components/GateControl.tsx` | Novo | Controle de portão Nice Guarita |
| `src/pages/VisitorsPage.tsx` | Modificado | Integra DoorbellCapture |
| `src/pages/DashboardPage.tsx` | Modificado | Integra GateControl |

### Frontend Morador (`frontend-visitor/`)

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/lib/residentApi.ts` | Novo | API client do portal do morador |
| `src/app/login/page.tsx` | Modificado | 3 opções: Morador / Convite / Primeiro Acesso |
| `src/app/login/auth/page.tsx` | Novo | Login CPF + telefone |
| `src/app/login/dashboard/page.tsx` | Novo | Dashboard do morador |
| `src/app/login/pre-register/page.tsx` | Novo | Formulário de pré-cadastro |
