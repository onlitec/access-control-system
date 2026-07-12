# Plano de Implementação: Sistema de Níveis de Acesso — OnliAcesso

Este plano estabelece a arquitetura do **Sistema de Níveis de Acesso** no OnliAcesso, gerenciando cronogramas semanais, pontos de acesso (portões, leitores e catracas vinculados a hardwares físicos) e regras de sincronização automática com os dispositivos físicos locais.

## User Review Required

> [!IMPORTANT]
> A sincronização de permissões com os hardwares físicos (Nice Guarita e Leitores Faciais) deve rodar de forma estritamente assíncrona. Quando um operador edita um nível de acesso, o sistema deve salvar as alterações no banco de dados local imediatamente, atualizar o status do nível para "Sincronizando..." e despachar tarefas para uma fila em background de modo a não travar a interface web.

## Proposed Changes

### Banco de Dados (Prisma ORM)

#### [NEW] [schema.prisma](file:///e:/projeto_acesso/access-control-system/backend-api/prisma/schema.prisma)
Adicionar as models para pontos de acesso, cronogramas semanais e relacionamentos de níveis de acesso:

```prisma
model AccessPoint {
  id          String             @id @default(cuid())
  name        String
  areaId      String?            @map("area_id")
  area        AccessArea?        @relation(fields: [areaId], references: [id])
  deviceId    String?            @map("device_id")
  device      NetworkDevice?     @relation(fields: [deviceId], references: [id])
  pointType   String             @map("point_type") // "gate" | "turnstile" | "facial" | "intercom" | "floor"
  
  levels      AccessLevelPoint[]
  createdAt   DateTime           @default(now()) @map("created_at")

  @@map("access_points")
}

model AccessSchedule {
  id          String                 @id @default(cuid())
  name        String
  isAllDay    Boolean                @default(false) @map("is_all_day")
  rules       AccessScheduleRule[]
  levels      AccessLevel[]
  createdAt   DateTime               @default(now()) @map("created_at")

  @@map("access_schedules")
}

model AccessScheduleRule {
  id          String         @id @default(cuid())
  scheduleId  String         @map("schedule_id")
  schedule    AccessSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  weekday     Int            // 0=domingo ... 6=sábado
  startTime   String         @map("start_time") // "HH:MM"
  endTime     String         @map("end_time")   // "HH:MM"

  @@map("access_schedule_rules")
}

model AccessLevel {
  id          String             @id @default(cuid())
  name        String
  description String?
  scheduleId  String             @map("schedule_id")
  schedule    AccessSchedule     @relation(fields: [scheduleId], references: [id])
  status      String             @default("synced") // "synced" | "syncing" | "error"
  
  points      AccessLevelPoint[]
  people      PersonAccessLevel[]
  createdAt   DateTime           @default(now()) @map("created_at")
  updatedAt   DateTime           @updatedAt @map("updated_at")

  @@map("access_levels")
}

model AccessLevelPoint {
  accessLevelId String      @map("access_level_id")
  accessLevel   AccessLevel @relation(fields: [accessLevelId], references: [id], onDelete: Cascade)
  accessPointId String      @map("access_point_id")
  accessPoint   AccessPoint @relation(fields: [accessPointId], references: [id], onDelete: Cascade)

  @@id([accessLevelId, accessPointId])
  @@map("access_level_points")
}

model PersonAccessLevel {
  personId      String      @map("person_id")
  person        Person      @relation(fields: [personId], references: [id], onDelete: Cascade)
  accessLevelId String      @map("access_level_id")
  accessLevel   AccessLevel @relation(fields: [accessLevelId], references: [id], onDelete: Cascade)
  validFrom     DateTime?   @map("valid_from")
  validUntil    DateTime?   @map("valid_until")

  @@id([personId, accessLevelId])
  @@map("person_access_levels")
}
```

---

### Backend (Endpoints e Integração)

#### [NEW] [access-levels.routes.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/routes/access-levels.routes.ts)
Criar rotas para gerenciar cronogramas e permissões de acesso:
- `GET /api/access-levels` - Retorna a lista de níveis de acesso incluindo agregação de pontos associados por `pointType` (ex: `gate: 2`, `facial: 1`).
- `POST /api/access-levels` - Cria o nível e enfileira a criação física.
- `GET /api/access-levels/:id` - Retorna detalhes do nível e pontos de acesso vinculados.
- `PUT /api/access-levels/:id` - Atualiza o nome, descrição e cronograma do nível.
- `DELETE /api/access-levels/:id` - Exclui o nível de acesso (se houver moradores/pessoas vinculadas, exige query string de confirmação forçada, caso contrário retorna aviso).
- `PUT /api/access-levels/:id/points` - Atualiza em lote (array de IDs) as portas e leitores associados àquele nível.
- `GET /api/access-points/tree` - Retorna a árvore hierárquica de áreas condominiais contendo os pontos de acesso (`AccessPoint`) cadastrados como folhas dos nós.
- `GET /api/access-schedules` e `POST /api/access-schedules` - Gerenciamento de cronogramas.
- `GET /api/access-schedules/:id/preview` - Retorna a grade de faixas horárias estruturada para exibição no frontend.
- `PUT /api/people/:id/access-levels` - Vincula/desvincula níveis de acesso a um morador ou prestador com data de validade opcional (`validFrom`/`validUntil`).

#### [NEW] [AccessSyncWorker.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/services/AccessSyncWorker.ts)
Serviço em background responsável por monitorar as alterações em `AccessLevel` e despachar comandos de inserção/deleção de permissões para as APIs físicas:
- Nice Guarita MG3000 (atualização de permissões de TAG/Controle).
- Terminais de Acesso Facial (sincronização de biometria facial e regras de passagem pelas portas).

#### [NEW] [Seed]
Inserir no setup inicial o cronograma "Modelo para o dia todo" (segunda a domingo, das 00:00 às 23:59).

---

### Frontend

#### [NEW] [AccessLevelsPage.tsx](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/AccessLevelsPage.tsx)
Tela de listagem de níveis de acesso:
- Tabela exibindo o nome do nível, cronograma de acesso vinculado e a contagem agregada de dispositivos por tipo.
- Status visual de sincronização física ("Sincronizado", "Sincronizando...", "Erro").

#### [NEW] [AccessLevelFormPage.tsx](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/AccessLevelFormPage.tsx)
Formulário de criação/edição de níveis de acesso contendo o componente central:
- **`AccessPointTransferList` (Dual List):**
  - Painel esquerdo: Árvore hierárquica por Área, contendo checkboxes para selecionar os pontos de acesso disponíveis.
  - Painel direito: Tabela plana exibindo os pontos de acesso que foram selecionados para pertencer ao nível.
  - Botões centrais para transferir os itens.
- **Seletor de Cronograma:** Dropdown com botão "Visualizar" que abre um modal gráfico do calendário semanal do cronograma selecionado.

#### [NEW] [AssignAccessLevelsPage.tsx](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/AssignAccessLevelsPage.tsx)
Tela voltada para atribuir níveis de acesso a múltiplos moradores ou prestadores, permitindo configurar a vigência do acesso em lote.

---

## Verification Plan

### Automated Tests
- Criar testes no `Vitest` para garantir que o cálculo agregador por tipo de ponto de acesso retorne as contagens corretas ao buscar os níveis de acesso.
- Garantir que a remoção de um nível de acesso que possua pessoas ativas lance um alerta de restrição.

### Manual Verification
- Cadastrar um nível de acesso "Moradores Bloco A", associá-lo ao ponto de acesso "Portaria Principal" e ao cronograma comercial. Validar se o worker envia a nova credencial para a controladora Nice e para o leitor facial cadastrado.
