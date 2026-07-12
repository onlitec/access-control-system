# Prompt: Gestão de Dispositivos — OnliAcesso (modelo HikCentral)

## Contexto do projeto

Estou no **OnliAcesso** (Next.js/Vite, Node.js, PostgreSQL, Nginx), independente do HikCentral. Já especifiquei antes dois módulos que essa tela conecta:
1. **Descoberta automática de dispositivos** (`network_devices`, discovery via ONVIF/SADP/mDNS/ARP).
2. **Níveis de Acesso** (`access_points`, que referenciam `network_devices`).

Agora quero implementar a tela de **Gestão de Dispositivos** (`Dispositivo > Dispositivo e servidor`), no mesmo padrão do print anexado do HikCentral: uma página única dividida em duas seções —

- **Topo**: tabela de dispositivos **já cadastrados/adicionados** na plataforma, com colunas Nome, Endereço, Tipo, Câmeras disponíveis, Local (área), e ações (engrenagem = configurar, ícone de refresh = sincronizar status).
- **Base**: seção **"Dispositivo online"**, mostrando os dispositivos encontrados na rede local (reaproveitando o serviço de discovery), com filtros por protocolo, opção de ocultar já adicionados, e ação de ativar/adicionar.

Além disso, o menu lateral do HikCentral categoriza os dispositivos por função (Dispositivo de codificação, Dispositivo de controle de acesso, Dispositivo de controle de elevador, Terminal de visitante, Dispositivo de transmissão de rede, Servidor de gravação, Servidor de transmissão, Servidor de análise inteligente) — quero replicar essa categorização no OnliAcesso, adaptada aos dispositivos que realmente usamos (câmeras/NVR, controladoras de acesso, leitores faciais, interfones/porteiros, gateways de rede).

## Modelo de dados (extensão da tabela `network_devices` do discovery)

```sql
-- Categorias de dispositivo (equivalente aos itens do menu lateral do HikCentral)
CREATE TABLE device_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL, -- 'encoding' | 'access_control' | 'elevator_control' | 'visitor_terminal' | 'network_transmission' | 'recording_server'
  name VARCHAR(100) NOT NULL
);

-- Extensão da tabela já criada no prompt de discovery
ALTER TABLE network_devices
  ADD COLUMN category_id UUID REFERENCES device_categories(id),
  ADD COLUMN area_id UUID REFERENCES access_areas(id), -- reaproveita tabela de áreas do módulo de níveis de acesso
  ADD COLUMN friendly_name VARCHAR(150),
  ADD COLUMN channel_count INTEGER DEFAULT 0, -- "Câmeras disponíveis" no caso de NVR
  ADD COLUMN http_port INTEGER DEFAULT 80,
  ADD COLUMN sdk_port INTEGER DEFAULT 8000,
  ADD COLUMN subnet_mask VARCHAR(15),
  ADD COLUMN gateway VARCHAR(15),
  ADD COLUMN dhcp_enabled BOOLEAN DEFAULT false,
  ADD COLUMN credential_username VARCHAR(100),
  ADD COLUMN credential_password_encrypted TEXT, -- reaproveitar esquema de criptografia já usado p/ credenciais Nice Guarita
  ADD COLUMN firmware_version VARCHAR(50),
  ADD COLUMN status VARCHAR(20) DEFAULT 'unknown', -- 'online' | 'offline' | 'error' | 'unknown'
  ADD COLUMN last_sync_at TIMESTAMPTZ,
  ADD COLUMN is_added BOOLEAN DEFAULT false; -- diferencia "descoberto" de "efetivamente cadastrado"

-- Histórico de sincronização/erros por dispositivo (para o botão de refresh individual e "Atualizar tudo")
CREATE TABLE device_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES network_devices(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Backend — endpoints

```
GET    /api/devices                        // lista de dispositivos ADICIONADOS (is_added=true)
        // filtros: ?category_id=&area_id=&search=&sort=
POST   /api/devices                         // adiciona manualmente (fallback se discovery não achou)
GET    /api/devices/:id
PUT    /api/devices/:id                     // edita nome amigável, área, credenciais
DELETE /api/devices                         // bulk delete (array de ids, igual ao "Excluir" com checkboxes)

POST   /api/devices/:id/sync                // dispara sincronização individual (botão de refresh na linha)
POST   /api/devices/sync-all                // "Atualizar tudo"
PUT    /api/devices/password                // "Modificar senha" em lote (array de device_ids + nova senha)
PUT    /api/devices/bandwidth               // "Editar largura de banda para download de vídeo"
PUT    /api/devices/timezone                // "Fuso horário" em lote

GET    /api/devices/online                  // resultado do discovery em tempo real (já especificado no prompt anterior)
        // ?hide_added=true equivale ao checkbox "Exibir dispositivo adicionado"
        // ?protocol=onvif|sadp|hikvision_private equivale ao dropdown "Protocolo privado Hikvision(137)"
POST   /api/devices/online/:tempId/activate // ativa um dispositivo que está "não ativado" (define senha inicial)
POST   /api/devices/online/:tempId/add      // move de "descoberto" para "adicionado" (is_added=true), abre modal de credenciais

GET    /api/device-categories               // popula o menu lateral
GET    /api/areas/tree                      // popula filtro "Local" e o seletor de área no cadastro
```

## Frontend — Tela de Gestão de Dispositivos (`/dispositivos`)

### Menu lateral (categorias)
Réplica do menu do HikCentral, adaptado:
- **Dispositivo e servidor** (grupo pai, expansível)
  - Dispositivo de codificação (câmeras/NVR)
  - Dispositivo de controle de acesso (controladoras, catracas, portões)
  - Terminal facial / biometria
  - Terminal de interfone/porteiro
  - Dispositivo de transmissão de rede (gateways, switches gerenciados relevantes)
- **Área** (árvore de áreas/torres, com destaque tipo "favorito" como a estrela do print)
- **Atualização de firmware**

Cada item filtra a tabela principal por `category_id`.

### Seção superior — Tabela de dispositivos adicionados
- Barra de ações: dropdown "Tudo" (filtro rápido por categoria), botões **Adicionar** (abre modal manual), **Excluir** (bulk, habilitado só com seleção), **Modificar senha** (bulk), **Editar largura de banda**, **Fuso horário**, **Atualizar tudo**, e um toggle tipo "Hot spare N+1" (pode ficar como placeholder desabilitado na v1, é uma feature avançada de redundância).
- Campo de busca no canto direito (`Pesquisar` por nome/IP).
- Tabela: Nome do dispositivo (link → tela de detalhe), Endereço de dispositivo (IP), Tipo do dispositivo, Câmeras disponíveis (contagem, só relevante para NVR/DVR), Local (área/torre), Operação (ícone engrenagem = configurações do dispositivo, ícone refresh = sincronizar status agora).
- Paginação: "Total: N", seletor de itens por página, navegação.
- Linhas com status visual (ex. ponto verde/vermelho) refletindo o campo `status`.

### Seção inferior — "Dispositivo online"
Reaproveita diretamente o resultado do módulo de discovery já especificado:
- Dropdown "Rede do servidor(N)" — pode ser simplificado para mostrar a sub-rede detectada do próprio servidor.
- Dropdown de filtro por protocolo (ONVIF / SADP-Hikvision / mDNS), com contador de dispositivos por protocolo.
- Botões: "Adicionar à lista de dispositivos" (bulk, habilita quando há seleção), "Ativar" (para dispositivos com senha ainda não configurada), "Atualizar tudo" (re-executa o scan), checkbox "Exibir dispositivo adicionado".
- Campo de busca por "Endereço IP/n° de série".
- Tabela: Endereço de dispositivo, N° de série, Porta do dispositivo (SDK), Porta HTTP, Máscara de sub-rede, Gateway, Ativado ou não, Adicionado ou não, DHCP usado ou não, Operação (editar/reset).
- Ao clicar em "Adicionar" numa linha, abrir modal pedindo: nome amigável, categoria, área/torre, usuário/senha do dispositivo — e então chamar `POST /api/devices/online/:tempId/add`.

### Tela de detalhe/configuração do dispositivo (`/dispositivos/:id`)
Acessada pelo ícone de engrenagem — abas:
- **Geral**: nome, IP, categoria, área, status, firmware.
- **Credenciais**: usuário/senha (senha sempre mascarada, com botão "Alterar").
- **Canais** (se for NVR/DVR): lista de canais/câmeras vinculadas, com opção de vincular a um `access_point` do módulo de níveis de acesso.
- **Logs de sincronização**: histórico vindo de `device_sync_logs`.

## Regras de negócio importantes

- Um dispositivo só pode ser excluído da lista de "adicionados" se não estiver vinculado a nenhum `access_point` em uso por um nível de acesso ativo — validar e bloquear com mensagem clara, assim como o HikCentral impede exclusões que quebrariam vínculos.
- "Atualizar tudo" deve rodar como job assíncrono (fila) e atualizar o campo `status`/`last_sync_at` incrementalmente via WebSocket, sem travar a UI — mesmo padrão já definido no módulo de discovery.
- "Modificar senha" em lote deve validar que a nova senha atende à política mínima de segurança do fabricante (ex. Hikvision exige 8-16 caracteres com complexidade) antes de disparar a alteração remota em cada dispositivo.
- Ao mover um dispositivo de "online" para "adicionado", herdar automaticamente `category_id` inferido no discovery (câmera/NVR via ONVIF `device_type`, controladora via SADP, etc.) mas permitir que o operador corrija manualmente no modal.

## Entregáveis esperados

1. Migrations (categorias, extensão de `network_devices`, `device_sync_logs`).
2. Endpoints REST listados.
3. Página de Gestão de Dispositivos com as duas seções (adicionados + online).
4. Menu lateral de categorias e áreas.
5. Modal de ativação/cadastro de dispositivo vindo da seção "online".
6. Tela de detalhe/configuração do dispositivo com abas.

Por favor, comece pelas migrations e pelo endpoint `GET /api/devices` com filtros, seguido da tabela principal no frontend — a seção "online" já reaproveita boa parte do que foi construído no módulo de discovery, então pode vir depois.
