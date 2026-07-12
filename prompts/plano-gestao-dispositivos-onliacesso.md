# Plano de Implementação: Gestão de Dispositivos (Adicionados e Online) — OnliAcesso

Este plano especifica a criação da tela de **Gestão de Dispositivos** (`Dispositivo > Dispositivo e servidor`), organizando os dispositivos em categorias de hardware e áreas físicas, com controle central de dispositivos adicionados (seção superior) e descobertos/online na rede (seção inferior).

## User Review Required

> [!IMPORTANT]
> A exclusão de um dispositivo cadastrado deve ser bloqueada se houver dependências ativas. Especificamente, se o dispositivo estiver vinculado a um Ponto de Acesso (`AccessPoint`) que esteja associado a um Nível de Acesso ativo (`AccessLevel`), a API deve retornar um erro explicativo (`400 Bad Request`) impedindo que a integridade lógica do sistema de controle de acesso seja violada.

## Proposed Changes

### Banco de Dados (Prisma ORM)

#### [NEW] [schema.prisma](file:///e:/projeto_acesso/access-control-system/backend-api/prisma/schema.prisma)
Adicionar as tabelas `DeviceCategory` e `DeviceSyncLog`:

```prisma
model DeviceCategory {
  id        String          @id @default(cuid())
  code      String          @unique // "encoding" | "access_control" | "facial" | "intercom" | "network"
  name      String
  devices   NetworkDevice[]

  @@map("device_categories")
}

model DeviceSyncLog {
  id        String        @id @default(cuid())
  deviceId  String        @map("device_id")
  device    NetworkDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  status    String        // "success" | "error"
  message   String?
  createdAt DateTime      @default(now()) @map("created_at")

  @@map("device_sync_logs")
}
```

E garantir as relações na tabela `NetworkDevice` (referente ao plano de discovery).

---

### Backend (Endpoints de API)

#### [NEW] [devices.routes.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/routes/devices.routes.ts)
Implementar as rotas para o CRUD e operações avançadas de dispositivos:
- `GET /api/devices` - Retorna a lista de dispositivos cadastrados (`isAdded = true`), com filtros por `categoryId`, `areaId`, termo de busca e ordenação. As senhas de credenciais devem ser ocultadas explicitamente no select do Prisma.
- `POST /api/devices` - Cadastro manual direto de dispositivos (quando o discovery não é aplicável).
- `GET /api/devices/:id` - Detalhes do dispositivo + logs de sincronização recentes.
- `PUT /api/devices/:id` - Atualização de nome amigável, área, credenciais e portas.
- `DELETE /api/devices` - Remoção em lote. Valida se algum dispositivo possui vínculo com `AccessPoint` antes de executar a exclusão.
- `POST /api/devices/:id/sync` e `POST /api/devices/sync-all` - Dispara Jobs assíncronos para atualizar dados de firmware e status de rede local dos dispositivos via socket ping ou protocolo nativo (ONVIF/SADP).
- `PUT /api/devices/password` - Modificação em lote da credencial de senha dos dispositivos selecionados.
- `PUT /api/devices/bandwidth` - Ajuste de limites de banda para câmeras/NVRs.
- `PUT /api/devices/timezone` - Sincronização de timezone com os hardwares em lote.
- `GET /api/devices/online` - Retorna os dispositivos atualmente escaneados no Discovery (com query string `hide_added=true` e `protocol=...`).
- `POST /api/devices/online/:tempId/activate` - Ativação inicial de dispositivo que está de fábrica (sem senha definida).
- `POST /api/devices/online/:tempId/add` - Promove o dispositivo da seção "descobertos" para "cadastrados", salvando credenciais e área associada.
- `GET /api/device-categories` - Lista as categorias disponíveis para popular o menu lateral.

---

### Frontend

#### [NEW] [VmsDevicesPage.tsx](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/VmsDevicesPage.tsx)
Interface principal de gerenciamento de hardware:
1. **Menu Lateral (Categorias & Áreas):**
   - Árvore de áreas condominiais com opção de favoritar (marcar com estrela no topo).
   - Lista estática das categorias de dispositivos (Vídeo, Controle de Acesso, Faciais, Interfonia).
2. **Seção Superior (Dispositivos Cadastrados):**
   - Tabela com ações de configuração individual (ícone de engrenagem) e re-sync (ícone de refresh).
   - Operações em lote no topo: Excluir, Modificar Senha, Fuso Horário, Largura de Banda e Atualizar Tudo.
   - Status visual (indicador verde/vermelho/cinza) baseado no status de ping/conexão do dispositivo.
3. **Seção Inferior (Dispositivos Online):**
   - Lista dinâmica baseada na descoberta automática ativa.
   - Filtros de protocolo (ONVIF, SADP, mDNS).
   - Ações de "Ativar" (dispositivo novo de fábrica) e "Adicionar à Plataforma" (abre modal de formulário completo).

#### [NEW] [DeviceDetailPage.tsx](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/DeviceDetailPage.tsx)
Página acessada pela engrenagem de configuração com abas organizadas:
- **Geral:** Informações de modelo, IP, firmware, status e área.
- **Credenciais:** Modificar usuário e senha (com campo mascarado).
- **Canais:** (Apenas para NVR/DVR) lista de canais de vídeo descobertos que podem ser promovidos para Pontos de Acesso.
- **Logs de Sincronização:** Histórico de erros e conexões do banco de dados `device_sync_logs`.

---

## Verification Plan

### Automated Tests
- Criar testes de integração `Vitest` em `backend-api/src/tests/devices.test.ts` para validar o bloqueio de exclusão de dispositivos que possuem relacionamento ativo com `AccessPoint`.
- Validar se o endpoint `GET /api/devices` sanitiza e omite as senhas das credenciais.

### Manual Verification
- Cadastrar um NVR simulado e tentar excluí-lo enquanto estiver associado a uma porta/ponto de acesso no painel administrativo, certificando-se de receber o alerta de bloqueio.
- Validar se a alteração de fuso horário em lote atualiza a tabela no banco e envia o payload correto aos dispositivos.
