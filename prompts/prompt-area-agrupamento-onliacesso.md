# Prompt: Tela de Área — Agrupamento de Dispositivos/Canais — OnliAcesso (modelo HikCentral)

## Contexto do projeto

Continuação dos módulos já especificados no OnliAcesso (Next.js/Vite, Node.js, PostgreSQL, Nginx, independente do HikCentral). Já existe a tabela `access_areas` (árvore de áreas) e `network_devices.area_id` (vínculo opcional, sem restrição de categoria), especificados no módulo de Gestão de Dispositivos.

Agora quero refinar isso na tela **`Dispositivo > Área`**, replicando o print do HikCentral: uma árvore de áreas à esquerda + uma tabela com abas por tipo de recurso (**Câmera, Porta, Elevador, Entrada de alarme, Saída de alarme**) à direita, onde o operador visualiza **todos os canais/pontos** (não os dispositivos físicos, mas os recursos individuais que eles expõem — ex. um NVR com 32 canais aparece como 32 linhas na aba Câmera) e pode agrupá-los em áreas livremente, misturando tipos diferentes na mesma área.

## Diferença importante: dispositivo físico vs. recurso/canal

Até agora, `network_devices` representa o **dispositivo físico** (o NVR, a controladora, o leitor facial). Só que um NVR sozinho expõe dezenas de câmeras (canais), e uma controladora de acesso expõe múltiplas portas/catracas. A tela de Área do HikCentral trabalha no nível de **recurso individual**, não no nível do dispositivo físico — por isso preciso de uma tabela nova:

```sql
-- Recurso/canal individual exposto por um dispositivo físico
CREATE TABLE device_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES network_devices(id) ON DELETE CASCADE, -- dispositivo físico "pai" (ex: NVR, controladora)
  resource_type VARCHAR(20) NOT NULL, -- 'camera' | 'door' | 'elevator_floor' | 'alarm_input' | 'alarm_output'
  name VARCHAR(150) NOT NULL,          -- ex: "CA-03-CP-01", "FACIAIS VEICULOS TORRE-1"
  channel_number INTEGER,              -- só relevante para 'camera' e 'elevator_floor'
  channel_ip VARCHAR(15),              -- "Endereço do canal" (pode ser igual ou diferente do IP do device pai)
  network_status VARCHAR(20) DEFAULT 'unknown', -- 'online' | 'offline'
  area_id UUID REFERENCES access_areas(id),      -- vínculo opcional, é a grande feature desta tela
  recording_schedule_id UUID REFERENCES access_schedules(id), -- só usado quando resource_type='camera'
  storage_path VARCHAR(255),           -- "Armazenamento de imagens" (ex: "C:\"), só câmera
  manufacturer VARCHAR(50),            -- denormalizado a partir do device pai, para exibir na coluna "Fabricante"
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_device_resources_area ON device_resources(area_id);
CREATE INDEX idx_device_resources_type ON device_resources(resource_type);
```

> Observação: para dispositivos simples (ex. um leitor facial standalone, que não é um NVR), o cadastro no módulo de Gestão de Dispositivos deve criar automaticamente **um único registro correspondente em `device_resources`** (ex. `resource_type='door'` ou um tipo compatível), para que ele também apareça nesta tela de Área. Para NVRs, os canais são criados a partir da leitura dos canais reais do equipamento (via ONVIF `GetProfiles` ou SDK privado) no momento do cadastro, ou re-sincronizados no botão "Atualizar tudo" já especificado no módulo de Gestão de Dispositivos.

## Backend — endpoints

```
GET    /api/areas/tree                         // árvore de áreas com contagem de recursos por área (já existente, sem mudança)

GET    /api/device-resources                    // tabela principal desta tela
        // query params: ?resource_type=camera|door|elevator_floor|alarm_input|alarm_output
        //               &area_id=  (filtra por área selecionada na árvore; omitir = mostra todas)
        //               &search=   (busca por nome/IP)

PUT    /api/device-resources/area                // AÇÃO PRINCIPAL: agrupamento em lote
        // body: { resource_ids: string[], area_id: string | null }
        // equivale a arrastar N linhas selecionadas para dentro de um nó da árvore,
        // ou usar o botão "Configurar área" em lote a partir da seleção por checkbox

PUT    /api/device-resources/:id                 // edição individual (nome do canal, endereço, área)
GET    /api/device-resources/:id
```

## Frontend — Tela `/dispositivos/areas`

### Coluna esquerda: árvore de áreas
- Nó raiz representando a instalação/condomínio (equivalente ao "HikCentral Professional" do print), com sub-nós = áreas criadas (`access_areas`).
- Cada nó mostra contagem de recursos vinculados.
- Suporte a **drag-and-drop**: arrastar uma ou mais linhas selecionadas da tabela da direita para um nó da árvore chama `PUT /api/device-resources/area`.
- Clicar num nó filtra a tabela à direita por aquela área (`?area_id=`). Clicar no nó raiz mostra todos os recursos, agrupados ou não.
- Reaproveitar os botões já existentes no módulo de Gestão de Dispositivos (criar área, renomear, excluir, marcar favorito com estrela).

### Coluna direita: abas por tipo de recurso
Abas fixas no topo, cada uma filtrando `resource_type`:
- **Câmera** (`camera`)
- **Porta** (`door`)
- **Elevador** (`elevator_floor`)
- **Entrada de alarme** (`alarm_input`)
- **Saída de alarme** (`alarm_output`)

### Tabela (colunas replicando o print, adaptadas)
| Coluna | Fonte | Observação |
|---|---|---|
| Nome | `device_resources.name` | link editável inline |
| Endereço do canal | `channel_number` | só exibido em Câmera/Elevador |
| Endereço de rede | `channel_ip` ou IP do device pai | |
| Dispositivo | `device_id` → `network_devices.friendly_name` | link para a tela de detalhe do dispositivo físico |
| Status da rede | `network_status` | badge verde "On-line" / vermelho "Off-line" |
| Programação de gravação | `recording_schedule_id` → nome do cronograma | só Câmera; "--" para os demais tipos |
| Armazenamento de imagens | `storage_path` | só Câmera; "--" para os demais |
| Área | `area_id` → `access_areas.name` | "Sem área" quando `NULL` |
| Fabricante | `manufacturer` | |
| Ações | editar / remover da área | |

### Ações em lote (barra de ferramentas acima da tabela)
- Seleção múltipla via checkbox (como no print, com checkbox de "selecionar todos" no cabeçalho).
- Botão **"Configurar área"** — abre um seletor de área (mesma árvore, num modal) e aplica a todos os itens selecionados de uma vez via `PUT /api/device-resources/area`. Esta é a funcionalidade central pedida: **agrupar dispositivos/canais de tipos diferentes na mesma área em lote**, sem depender só do drag-and-drop.
- Botão de exportação da lista filtrada (reaproveitar padrão de export já usado em outros módulos do OnliDesk/OnliAcesso).
- Campo de busca por nome/IP no canto superior direito da tabela.
- Paginação padrão ("Total: N", seletor de itens por página).

## Regras de negócio importantes

- Uma área pode conter recursos de **todos os tipos ao mesmo tempo** — a aba apenas filtra a visualização, não restringe o agrupamento. Um `area_id` pode estar presente em registros de `resource_type` diferentes simultaneamente.
- Ao desvincular um recurso de uma área (`area_id = NULL`), ele deve continuar existindo normalmente e aparecer na visão "Sem área" — nunca excluir o registro de `device_resources` por causa disso.
- Ao excluir um dispositivo físico em `network_devices` (módulo de Gestão de Dispositivos), remover em cascata todos os seus `device_resources` (`ON DELETE CASCADE` já cobre isso), mas exibir aviso prévio caso algum desses recursos esteja vinculado a um `access_point` usado em nível de acesso ativo — mesma regra de proteção já definida no módulo de Níveis de Acesso.
- O `manufacturer` fica denormalizado por performance (evita join constante nesta tabela que pode ter centenas de linhas, como os 147 registros do print), mas deve ser atualizado automaticamente sempre que o dispositivo pai for editado.

## Entregáveis esperados

1. Migration de `device_resources`.
2. Lógica de criação automática de `device_resources` no momento do cadastro/sincronização de um dispositivo (1 registro para dispositivos simples, N registros para NVR/controladoras multicanal).
3. Endpoints listados.
4. Tela `/dispositivos/areas` com árvore + abas + tabela + drag-and-drop + ação "Configurar área" em lote.

Por favor, comece pela migration de `device_resources` e pela lógica de criação automática a partir de um dispositivo já cadastrado (usando os dispositivos que já existem em `network_devices` dos módulos anteriores), depois implemente o endpoint `PUT /api/device-resources/area` (ação central de agrupamento), e só então a UI completa com drag-and-drop.
