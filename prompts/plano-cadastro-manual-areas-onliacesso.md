# Plano de Implementação: Cadastro Manual de Dispositivos e Gestão de Áreas — OnliAcesso

Este plano detalha a especificação do **Formulário de Cadastro Manual de Dispositivos** (incluindo adição por IP individual, range de IP ou importação de planilhas CSV) e o módulo completo de **Gestão de Áreas** com suporte a hierarquias recursivas e categorização mista de dispositivos.

## User Review Required

> [!WARNING]
> O processo de adição de dispositivos em lote via "Segmento IP" e "Importar em lote (CSV/XLSX)" deve ser processado de forma estritamente assíncrona. Dispositivos lentos ou inacessíveis no range podem causar timeouts de requisição se executados de forma síncrona. Os resultados serão transmitidos linha a linha via WebSocket/SSE para manter a interface responsiva.

## Proposed Changes

### Banco de Dados (Prisma ORM)

#### [MODIFY] [schema.prisma](file:///e:/projeto_acesso/access-control-system/backend-api/prisma/schema.prisma)
Atualizar a model `AccessArea` para suportar o auto-relacionamento (hierarquia) e áreas favoritas:

```prisma
model AccessArea {
  id             String               @id @default(cuid())
  name           String
  description    String?              // Descrição adicional da área física
  icon           String?              @default("🏠")
  isActive       Boolean              @default(true) @map("is_active")
  isFavorite     Boolean              @default(false) @map("is_favorite") // Estrela no menu do HikCentral
  order          Int                  @default(0)
  
  parentId       String?              @map("parent_id")
  parent         AccessArea?          @relation("AreaToArea", fields: [parentId], references: [id], onDelete: Cascade)
  children       AccessArea[]         @relation("AreaToArea")
  
  devices        NetworkDevice[]      // Dispositivos associados (opcional e misto)
  residentAccess ResidentAccessArea[]
  doors          AccessAreaDoor[]
  createdAt      DateTime             @default(now()) @map("created_at")
  updatedAt      DateTime             @updatedAt @map("updated_at")

  @@map("access_areas")
}
```

---

### Backend (Endpoints e Serviços)

#### [NEW] [devices.routes.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/routes/devices.routes.ts)
Incluir novos endpoints de conexão e processamento em lote:
- `POST /api/devices/test-connection` - Executa um handshake pontual no protocolo selecionado (`ONVIF`, `SADP`, `Nice Guarita` ou porta TCP manual) com os dados e credenciais passados pelo formulário, retornando sucesso ou o código de erro retornado pelo dispositivo físico.
- `POST /api/devices/import-csv` - Recebe um arquivo `.csv` ou `.xlsx`, parseia e enfileira a adição sequencial dos dispositivos.
- `POST /api/devices/scan-segment` - Recebe o range inicial e final de IPs (ex: `10.10.1.1` a `10.10.1.254`), varrendo a rede local em fila assíncrona.

#### [MODIFY] [access-areas.routes.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/routes/access-areas.routes.ts)
Adicionar novos endpoints para a árvore hierárquica e associação de dispositivos:
- `GET /api/areas/tree` - Retorna a árvore hierárquica completa de áreas, incluindo a contagem agregada de todos os dispositivos vinculados em cada nó e seus filhos.
- `POST /api/areas` - Criação de áreas e sub-áreas (`parentId`).
- `PUT /api/areas/:id` - Atualização cadastral da área física e toggle do status de favorito (`isFavorite`).
- `DELETE /api/areas/:id?moveDevicesTo=` - Remove uma área. Se houver dispositivos nela, valida a query string `moveDevicesTo`. Caso seja especificado o ID de outra área, move os dispositivos para lá; caso contrário, os move para "Sem área" (`null`).
- `PUT /api/areas/:id/devices` - Associa em lote uma lista de IDs de dispositivos àquela área física.
- `GET /api/areas/:id/devices` - Retorna a listagem de todos os dispositivos agregados de uma área (câmeras, interfones, faciais), sem filtragem por categoria.

---

### Frontend

#### [NEW] [DeviceManualAddForm.tsx](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/components/vms/DeviceManualAddForm.tsx)
Formulário de cadastro que suporta os três modos de adição:
1. **Endereço IP/domínio:** Formulário tradicional com campos de IP, porta, credenciais, categoria e seletor em árvore da Área do dispositivo.
2. **Segmento IP:** Campos de IP inicial, IP final, portas padrões e credenciais padrões. Ao disparar, renderiza barra de progresso com os resultados incrementais do escaneamento.
3. **Importar em lote:** Input para upload de planilha CSV/XLSX com template disponível para download.
*   **Adicionar e continuar:** Botão alternativo que limpa os campos de identificação (IP/Nome), mantendo as credenciais preenchidas para cadastrar o próximo dispositivo mais rápido.

#### [NEW] [AccessAreasPage.tsx](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/AccessAreasPage.tsx)
Página administrativa de áreas físicas (`/dispositivos/areas`):
- **Painel Esquerdo (Árvore de Áreas):** Renderiza o organograma do condomínio. Botões para criar sub-áreas sobre o nó selecionado. Suporte a marcação de estrela (favorito) para fixar a área no topo do menu.
- **Painel Direito (Dispositivos Vinculados):** Exibe a lista unificada de todos os dispositivos associados à área selecionada na árvore, independente de categoria (NVR, Interfone, Leitor Facial juntos), com badges de tipo e status de rede.
- **Drag-and-Drop:** Suporte visual para arrastar dispositivos da listagem e soltá-los dentro de um nó da árvore de áreas, chamando automaticamente a API de associação.

---

## Verification Plan

### Automated Tests
- Criar testes unitários para a importação de CSV garantindo que registros mal formatados sejam rejeitados e informados com a linha exata do arquivo.
- Validar no Prisma as operações de deleção em cascata/atualização preventiva para a tabela `AccessArea`.

### Manual Verification
- Acessar o formulário de cadastro manual, preencher um IP inexistente, clicar em "Adicionar" e garantir que o spinner "Testando conexão..." exiba o erro amigável de timeout ao invés de salvar o dispositivo inválido no banco.
- Excluir uma área com dispositivos e validar no banco se os dispositivos órfãos foram movidos para a área configurada na rota de remoção.
