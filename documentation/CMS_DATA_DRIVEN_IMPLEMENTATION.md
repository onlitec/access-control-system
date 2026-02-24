# CMS Data-Driven Implementation

## Visão Geral

Este documento descreve a implementação do sistema CMS Data-Driven para o HikCentral, que permite configurar dinamicamente quais entidades do HikCentral alimentam cada página do painel administrativo, sem necessidade de alterações no código.

---

## 1. Planejamento

### 1.1 Objetivo

Transformar a integração HikCentral em um sistema 100% data-driven, onde o administrador pode configurar mapeamentos entre entidades HikCentral (departamentos, áreas, níveis de acesso, etc.) e páginas do painel através de uma interface administrativa.

### 1.2 Requisitos

- **Modelo Universal**: Uma tabela de mapeamento que suporte qualquer tipo de entidade HikCentral
- **Interface Admin**: Página de configuração para gerenciar mapeamentos
- **Fallback Automático**: Sistema deve funcionar mesmo sem mapeamentos configurados
- **Cache Inteligente**: Reduzir chamadas à API HikCentral com TTL por tipo de entidade

### 1.3 Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend Admin                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Settings Page → Mapeamentos de Entidades (CMS)          │   │
│  │  - Tree view de Organizations                            │   │
│  │  - Selects para Access Levels, Custom Fields, etc        │   │
│  │  - CRUD de EntityMappings                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend API                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  /api/admin/entities/*  → Busca entidades HikCentral     │   │
│  │  /api/admin/mappings    → CRUD de EntityMappings         │   │
│  │  /api/admin/cache/refresh → Limpar cache                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  EntityMappingService                                    │   │
│  │  - resolveForPage(pageRoute) → ResolvedMapping[]         │   │
│  │  - resolveOrgCodesForPage(pageRoute) → string[]          │   │
│  │  - resolveOrgCodesWithFallback(pageRoute) → string[]     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HikCentralService (com Cache Inteligente)               │   │
│  │  - getRegionsList() → Áreas físicas                      │   │
│  │  - getPrivilegeGroups() → Níveis de acesso               │   │
│  │  - getFloorsList() → Pisos/andares                       │   │
│  │  - getVisitorGroups() → Grupos de visitantes            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Database (PostgreSQL)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  entity_mappings                                         │   │
│  │  - id, pageRoute, entityType, hikEntityId               │   │
│  │  - hikEntityName, isActive, priority, filterConfig      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementação

### 2.1 Fase 1 - Fundação (Backend)

#### 2.1.1 Prisma Schema - EntityMapping Model

**Arquivo**: `backend-api/prisma/schema.prisma`

```prisma
model EntityMapping {
  id            String   @id @default(uuid())
  pageRoute     String   @map("page_route")
  entityType    String   @map("entity_type")
  hikEntityId   String   @map("hik_entity_id")
  hikEntityName String   @map("hik_entity_name")
  isActive      Boolean  @default(true) @map("is_active")
  priority      Int      @default(0)
  filterConfig  Json?    @map("filter_config")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  createdBy     String?  @map("created_by")

  @@index([pageRoute])
  @@index([entityType])
  @@index([pageRoute, entityType, isActive])
  @@map("entity_mappings")
}
```

**Campos**:
- `pageRoute`: Rota da página do painel (ex: `/painel/residents`)
- `entityType`: Tipo de entidade HikCentral (`ORGANIZATION`, `AREA`, `ACCESS_LEVEL`, etc.)
- `hikEntityId`: ID da entidade no HikCentral (ex: `2` para MORADORES)
- `hikEntityName`: Nome legível para exibição no admin
- `isActive`: Permite ativar/desativar mapeamentos
- `priority`: Ordem de aplicação (menor = maior prioridade)
- `filterConfig`: Configurações adicionais de filtro (JSON)

#### 2.1.2 HikCentralService - Cache Inteligente

**Arquivo**: `backend-api/src/services/HikCentralService.ts`

**Cache TTL por tipo de entidade**:
| Entidade | TTL | Razão |
|----------|-----|-------|
| Organizations | 5 min | Estrutura muda pouco |
| Visitor Groups | 5 min | Configuração de visitantes |
| Areas (Regions) | 10 min | Áreas físicas |
| Access Levels | 15 min | Níveis de acesso |
| Custom Fields | 30 min | Campos customizados |
| Floors | 1 hora | Pisos raramente mudam |

**Novos métodos**:
```typescript
// Com cache
async getRegionsList(): Promise<HikRegion[]>
async getPrivilegeGroups(type?: number): Promise<HikPrivilegeGroup[]>
async getFloorsList(): Promise<HikFloor[]>
async getVisitorGroups(): Promise<HikVisitorGroup[]>
```

#### 2.1.3 Admin Entities Controller

**Arquivo**: `backend-api/src/controllers/AdminEntitiesController.ts`

**Endpoints**:
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/admin/entities/organizations` | Lista departamentos (tree view) |
| GET | `/api/admin/entities/areas` | Lista áreas físicas |
| GET | `/api/admin/entities/access-levels` | Lista níveis de acesso |
| GET | `/api/admin/entities/custom-fields` | Lista campos customizados |
| GET | `/api/admin/entities/floors` | Lista pisos/andares |
| GET | `/api/admin/entities/visitor-groups` | Lista grupos de visitantes |
| POST | `/api/admin/cache/refresh` | Limpa cache de entidades |

#### 2.1.4 Entity Mappings Controller

**Arquivo**: `backend-api/src/controllers/EntityMappingsController.ts`

**Endpoints CRUD**:
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/admin/mappings` | Lista todos os mapeamentos |
| GET | `/api/admin/mappings/:id` | Busca mapeamento por ID |
| POST | `/api/admin/mappings` | Cria novo mapeamento |
| POST | `/api/admin/mappings/batch` | Cria múltiplos mapeamentos |
| PUT | `/api/admin/mappings/:id` | Atualiza mapeamento |
| DELETE | `/api/admin/mappings/:id` | Remove mapeamento |
| GET | `/api/admin/mappings/pages` | Lista páginas com mapeamentos |

---

### 2.2 Fase 2 - Interface Admin (Frontend)

#### 2.2.1 API Service

**Arquivo**: `frontend-admin/src/services/api.ts`

**Novas funções**:
```typescript
// Buscar entidades HikCentral
getAdminOrganizations(): Promise<HikEntity[]>
getAdminAreas(): Promise<HikEntity[]>
getAdminAccessLevels(type?: number): Promise<HikEntity[]>
getAdminCustomFields(): Promise<HikEntity[]>
getAdminFloors(): Promise<HikEntity[]>
getAdminVisitorGroups(): Promise<HikEntity[]>

// CRUD de mapeamentos
getEntityMappings(filters?): Promise<EntityMapping[]>
createEntityMapping(data): Promise<EntityMapping>
updateEntityMapping(id, data): Promise<EntityMapping>
deleteEntityMapping(id): Promise<void>
batchCreateEntityMappings(mappings): Promise<void>

// Cache
refreshAdminCache(entityType?): Promise<void>
```

#### 2.2.2 Settings Page - Seção CMS

**Arquivo**: `frontend-admin/src/pages/SettingsPage.tsx`

**Funcionalidades**:
- Lista mapeamentos existentes com detalhes
- Formulário para criar novo mapeamento
- Selects dinâmicos para páginas e entidades
- Botão para deletar mapeamentos
- Indicador de status (ativo/inativo)

**Tipos de Entidade Suportados**:
- `ORGANIZATION` - Departamento/Organização
- `AREA` - Área Física
- `ACCESS_LEVEL` - Nível de Acesso
- `CUSTOM_FIELD` - Campo Customizado
- `FLOOR` - Piso/Andar
- `VISITOR_GROUP` - Grupo de Visitantes

**Páginas do Painel**:
- `/painel/residents` - Moradores
- `/painel/staff` - Staff/Portaria
- `/painel/service-providers` - Prestadores
- `/painel/visitors` - Visitantes

---

### 2.3 Fase 3 - Refatoração Data-Driven

#### 2.3.1 EntityMappingService

**Arquivo**: `backend-api/src/services/EntityMappingService.ts`

**Métodos principais**:

```typescript
class EntityMappingService {
  // Resolve todos os mapeamentos ativos para uma página
  static async resolveForPage(pageRoute: string): Promise<ResolvedMapping[]>

  // Resolve orgIndexCodes para uma página (entityType = ORGANIZATION)
  static async resolveOrgCodesForPage(pageRoute: string): Promise<string[]>

  // Resolve múltiplas páginas de uma vez (para dashboard)
  static async resolveMultiplePages(pageRoutes: string[]): Promise<Map<string, ResolvedMapping[]>>

  // Verifica se uma página tem mapeamentos
  static async hasMappings(pageRoute: string): Promise<boolean>

  // Fallback hardcoded para compatibilidade
  static getFallbackOrgCodes(pageRoute: string): string[]

  // Resolve com fallback automático
  static async resolveOrgCodesWithFallback(pageRoute: string): Promise<string[]>
}
```

**Fallback hardcoded**:
```typescript
const fallbacks = {
  '/painel/residents': ['2'],        // MORADORES
  '/painel/staff': ['4'],            // PORTARIA
  '/painel/service-providers': ['3'], // PRESTADORES
};
```

#### 2.3.2 Endpoints Refatorados

**Arquivo**: `backend-api/src/index.ts`

**Antes** (hardcoded):
```typescript
const residentOrgCodes = await getOrgCodesForType(['MORADOR'], ['2', '7']);
const staffOrgCodes = await getOrgCodesForType(['PORTARIA', 'ADMIN'], ['4', '5', '6']);
const prestadoresOrgCodes = await getOrgCodesForType(['PRESTADOR'], ['3']);
```

**Depois** (data-driven):
```typescript
const residentOrgCodes = await EntityMappingService.resolveOrgCodesWithFallback('/painel/residents');
const staffOrgCodes = await EntityMappingService.resolveOrgCodesWithFallback('/painel/staff');
const prestadoresOrgCodes = await EntityMappingService.resolveOrgCodesWithFallback('/painel/service-providers');
```

**Endpoints refatorados**:
- `GET /api/residents`
- `GET /api/staff`
- `GET /api/service-providers`
- `GET /api/dashboard/stats`

---

## 3. Testes e Validação

### 3.1 Teste de Fluxo Completo

**Cenário**: Adicionar departamento CONDOMINIO ao mapeamento de STAFF

**Passos**:
1. Buscar organizações disponíveis:
   ```bash
   GET /api/admin/entities/organizations
   # Retorna: 1: All Departments, 2: MORADORES, 3: PRESTADORES, 4: PORTARIA, 5: CONDOMINIO
   ```

2. Criar novo mapeamento:
   ```bash
   POST /api/admin/mappings
   {
     "pageRoute": "/painel/staff",
     "entityType": "ORGANIZATION",
     "hikEntityId": "5",
     "hikEntityName": "CONDOMINIO",
     "priority": 2
   }
   ```

3. Verificar impacto:
   ```bash
   GET /api/staff
   # Logs: [HikCentral] STAFF orgCodes resolvidos: 4,5
   # Antes: orgCodes = 4 (apenas PORTARIA)
   # Depois: orgCodes = 4,5 (PORTARIA + CONDOMINIO)
   ```

### 3.2 Mapeamentos Iniciais

| Página | Entidade | ID | Nome |
|--------|----------|-----|------|
| `/painel/residents` | ORGANIZATION | 2 | MORADORES |
| `/painel/staff` | ORGANIZATION | 4 | PORTARIA |
| `/painel/staff` | ORGANIZATION | 5 | CONDOMINIO |
| `/painel/service-providers` | ORGANIZATION | 3 | PRESTADORES |

---

## 4. Endpoints API

### 4.1 Admin Entities

| Método | Endpoint | Autenticação | Descrição |
|--------|----------|--------------|-----------|
| GET | `/api/admin/entities/organizations` | Bearer Token | Lista departamentos |
| GET | `/api/admin/entities/areas` | Bearer Token | Lista áreas físicas |
| GET | `/api/admin/entities/access-levels?type=1` | Bearer Token | Lista níveis de acesso |
| GET | `/api/admin/entities/custom-fields` | Bearer Token | Lista campos customizados |
| GET | `/api/admin/entities/floors` | Bearer Token | Lista pisos |
| GET | `/api/admin/entities/visitor-groups` | Bearer Token | Lista grupos de visitantes |
| POST | `/api/admin/cache/refresh` | Bearer Token | Limpa cache |

### 4.2 Entity Mappings

| Método | Endpoint | Autenticação | Descrição |
|--------|----------|--------------|-----------|
| GET | `/api/admin/mappings` | Bearer Token | Lista todos |
| GET | `/api/admin/mappings?pageRoute=/painel/residents` | Bearer Token | Filtra por página |
| GET | `/api/admin/mappings/:id` | Bearer Token | Busca por ID |
| POST | `/api/admin/mappings` | Bearer Token | Cria um |
| POST | `/api/admin/mappings/batch` | Bearer Token | Cria múltiplos |
| PUT | `/api/admin/mappings/:id` | Bearer Token | Atualiza |
| DELETE | `/api/admin/mappings/:id` | Bearer Token | Remove |

---

## 5. Arquivos Modificados/Criados

### 5.1 Backend

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `prisma/schema.prisma` | Modificado | Adicionado modelo EntityMapping |
| `src/services/HikCentralService.ts` | Modificado | Cache + novos métodos |
| `src/services/EntityMappingService.ts` | **Criado** | Resolver de mapeamentos |
| `src/controllers/AdminEntitiesController.ts` | **Criado** | Busca entidades HikCentral |
| `src/controllers/EntityMappingsController.ts` | **Criado** | CRUD de mapeamentos |
| `src/controllers/DashboardController.ts` | Modificado | Usa EntityMappingService |
| `src/routes/admin.ts` | **Criado** | Rotas administrativas |
| `src/index.ts` | Modificado | Import + refatoração endpoints |

### 5.2 Frontend

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/services/api.ts` | Modificado | Funções de API admin |
| `src/pages/SettingsPage.tsx` | Modificado | Interface de mapeamentos |

---

## 6. Commits

| Hash | Mensagem |
|------|----------|
| `b37eca5` | feat: implementar CMS Data-Driven com EntityMappings |
| `8c0dd7e` | feat: adicionar interface CMS Data-Driven na página Settings |
| `8754735` | feat: implementar EntityMappingService e refatorar DashboardController |
| `958d4f3` | feat: refatorar endpoints residents/staff/providers para usar EntityMappingService |

---

## 7. Benefícios

1. **Flexibilidade Total**: Admin pode configurar mapeamentos sem alterar código
2. **Fallback Automático**: Sistema funciona mesmo sem mapeamentos configurados
3. **Cache Inteligente**: Reduz chamadas à API HikCentral
4. **Multi-entidade**: Suporta qualquer tipo de entidade HikCentral
5. **Priorização**: Mapeamentos podem ter prioridades diferentes
6. **Auditoria**: Timestamps e createdBy para rastreabilidade

---

## 8. Próximos Passos (Futuro)

1. **Interface de Drag-and-Drop**: Permitir reordenar mapeamentos visualmente
2. **Import/Export**: Exportar e importar configurações de mapeamentos
3. **Histórico de Alterações**: Log de mudanças nos mapeamentos
4. **Validação Visual**: Preview de quantas pessoas seriam afetadas
5. **Mapeamentos Avançados**: Suporte a filtros complexos (filterConfig)
6. **Multi-tenant**: Suporte a múltiplos condomínios com mapeamentos independentes

---

## 9. Troubleshooting

### 9.1 Mapeamentos não aplicados

**Sintoma**: Endpoint retorna dados antigos após criar mapeamento

**Causa**: Cache do HikCentralService ou Prisma Client desatualizado

**Solução**:
```bash
# Limpar cache
POST /api/admin/cache/refresh

# Reiniciar container
docker restart calabasas-api
```

### 9.2 Tabela entity_mappings não existe

**Sintoma**: Erro "relation entity_mappings does not exist"

**Causa**: Migração não aplicada

**Solução**:
```bash
# Dentro do container
docker exec -it calabasas-api npx prisma migrate deploy
```

### 9.3 Prisma Client não reconhece EntityMapping

**Sintoma**: "Property 'entityMapping' does not exist on PrismaClient"

**Causa**: Prisma Client não regenerado após mudança no schema

**Solução**:
```bash
# Regenerar e rebuildar
cd backend-api
npx prisma generate
npm run build
docker compose build backend-api
docker compose up -d backend-api
```

---

**Data de Implementação**: 24 de Fevereiro de 2026

**Autor**: Cascade AI Assistant

**Versão**: 1.0.0
