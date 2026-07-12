# Prompt: Sistema de Níveis de Acesso — OnliAcesso (modelo HikCentral)

## Contexto do projeto

Estou trabalhando no **OnliAcesso**, sistema web de controle de acesso condominial (Next.js/Vite no frontend, Node.js no backend, PostgreSQL, Nginx). O sistema deve permanecer **independente do HikCentral** — todos os dados vêm exclusivamente do PostgreSQL local, mas a experiência de configuração de nível de acesso deve replicar o padrão de UX do HikCentral Professional, que já uso em produção em outro projeto (Condomínio Calabasas).

Anexei 3 prints do HikCentral como referência visual/funcional:
1. Tela de listagem de dispositivos cadastrados (contexto do módulo de discovery já especificado em prompt anterior).
2. Tela de listagem de **Níveis de Acesso** (`Nível de Acesso > Gerenciar nível de acesso`) — colunas: Nome do nível, Cronograma de acesso, Ponto de acesso (com contadores por tipo, ex. "Controle de acesso:10", "Andar:0").
3. Tela de **edição de um nível de acesso** (ex. "MORADOR T1") — formulário com Nome, Descrição, Ponto de acesso (escopo "Todos os recursos"), um seletor duplo (árvore "Disponível" à esquerda, agrupada por área/torre, e lista "Selecionado" à direita), Cronograma de acesso (dropdown) e botões Salvar/Cancelar.

Quero implementar o mesmo conceito no OnliAcesso: **Níveis de Acesso** que agrupam um **cronograma** (horário permitido) + uma lista de **pontos de acesso** (portões, catracas, leitores faciais, interfones), e que depois são **atribuídos a pessoas** (moradores, visitantes, prestadores, funcionários, síndicos, zeladoria).

## Modelo de dados (PostgreSQL)

```sql
-- Áreas/agrupamentos hierárquicos (ex: "Torre 1", "Facais Veículos Torre 2-3-4")
CREATE TABLE access_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  parent_id UUID REFERENCES access_areas(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pontos de acesso: portões, catracas, leitores faciais, interfones, etc.
-- Vincula-se ao dispositivo físico cadastrado no módulo de discovery
CREATE TABLE access_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  area_id UUID REFERENCES access_areas(id),
  device_id UUID REFERENCES network_devices(id), -- do módulo de discovery
  point_type VARCHAR(30) NOT NULL, -- 'gate' | 'turnstile' | 'facial' | 'intercom' | 'floor'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cronogramas de acesso (templates de horário)
CREATE TABLE access_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL, -- ex: "Modelo para o dia todo", "Horário comercial"
  is_all_day BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Faixas de horário por dia da semana dentro de um cronograma
CREATE TABLE access_schedule_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES access_schedules(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL, -- 0=domingo ... 6=sábado
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

-- Níveis de acesso
CREATE TABLE access_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL, -- ex: "MORADOR T1", "VISITANTES T4"
  description TEXT,
  schedule_id UUID REFERENCES access_schedules(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Relação N:N entre nível de acesso e pontos de acesso
CREATE TABLE access_level_points (
  access_level_id UUID REFERENCES access_levels(id) ON DELETE CASCADE,
  access_point_id UUID REFERENCES access_points(id) ON DELETE CASCADE,
  PRIMARY KEY (access_level_id, access_point_id)
);

-- Relação N:N entre pessoas e níveis de acesso
-- (reaproveitar tabela "people" já existente no OnliAcesso, com campo de categoria:
--  morador, visitante, prestador, funcionario, sindico, zeladoria)
CREATE TABLE person_access_levels (
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  access_level_id UUID REFERENCES access_levels(id) ON DELETE CASCADE,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ, -- útil para visitantes/prestadores com validade
  PRIMARY KEY (person_id, access_level_id)
);
```

> Observação: o contador que aparece no HikCentral na coluna "Ponto de acesso" (ex. "Controle de acesso:10", "Andar:0") é apenas uma contagem agregada de `access_level_points` por `point_type`. Replicar isso com uma query de agregação, não como campo persistido.

## Backend — endpoints

```
GET    /api/access-levels                 // lista com contadores agregados por point_type
POST   /api/access-levels                 // cria nível (name, description, schedule_id)
GET    /api/access-levels/:id             // detalhe + pontos selecionados
PUT    /api/access-levels/:id             // atualiza nome/descrição/cronograma
DELETE /api/access-levels/:id

GET    /api/access-levels/:id/points      // pontos já vinculados
PUT    /api/access-levels/:id/points      // substitui o conjunto de pontos vinculados (bulk, igual ao "Salvar" do HikCentral — envia array completo de access_point_ids)

GET    /api/access-points/tree            // retorna árvore agrupada por área para o seletor "Disponível"
        // ?search= para filtro de busca em texto, igual aos dois campos "Pesquisar" das telas

GET    /api/access-schedules              // para popular o dropdown "Cronograma de acesso"
POST   /api/access-schedules
GET    /api/access-schedules/:id/preview  // dados para o botão "Visualizar" (grade semanal de horários)

GET    /api/people/:id/access-levels      // usado na tela "Atribuir nível de acesso"
PUT    /api/people/:id/access-levels      // atribui/revoga níveis para uma pessoa (bulk)
```

## Frontend — Telas

### 1. Listagem de Níveis de Acesso (`/controle-acesso/niveis`)
Espelhar a tela do print 2:
- Botões no topo: "Adicionar", "Excluir" (seleção múltipla via checkbox).
- Tabela: Nome do nível de acesso (link clicável), Cronograma de acesso, Ponto de acesso (badges com contagem por tipo, ex. ícone de catraca + "9", ícone de andar + "0").
- Paginação (Total: N / seletor de itens por página / navegação).
- Ordenação por coluna (setas de sort, como no HikCentral).

### 2. Edição/criação de Nível de Acesso (`/controle-acesso/niveis/:id`)
Espelhar a tela do print 3, é o componente mais importante:
- Campos: Nome do nível de acesso* (obrigatório), Descrição (textarea opcional).
- Dropdown "Ponto de acesso" com escopo (ex. "Todos os recursos" vs filtrar por tipo — pode ser simplificado numa primeira versão para só "Todos os recursos").
- **Dual list / transfer list**:
  - Painel esquerdo "Disponível": árvore expansível agrupada por área (ex. "FACIAIS PED ESCADA TORRES-2-3-4" como nó pai, dispositivos como filhos), com campo de busca no topo, checkboxes.
  - Painel direito "Selecionado": tabela simples com colunas Nome / Área, checkboxes para remover.
  - Botões `>` e `<` no centro para mover itens entre os dois painéis (ou permitir drag, mas os botões já resolvem e são mais simples de implementar).
  - Componente React reutilizável, ex. `<DualListTransfer items={} selected={} onChange={} groupBy="area" />` — pode usar uma lib como `react-transfer-list` ou implementar do zero com duas listas controladas por estado (mais controle sobre o agrupamento em árvore).
- Dropdown "Cronograma de acesso" + botão "Visualizar" (abre modal com grade semanal mostrando os horários daquele cronograma).
- Botões "Salvar" (persiste via `PUT /api/access-levels/:id` + `PUT /api/access-levels/:id/points`) e "Cancelar" (volta para listagem sem salvar).

### 3. Atribuir Nível de Acesso (`/controle-acesso/niveis/atribuir`)
Tela análoga, mas na direção pessoa → níveis: selecionar uma ou mais pessoas (ou um grupo, ex. "todos os moradores da Torre 1") e atribuir um ou mais níveis de acesso de uma vez, com opção de definir `valid_from`/`valid_until` para casos temporários (visitantes, prestadores).

## Regras de negócio importantes

- Ao vincular pontos de acesso a um nível, validar que o `access_point.device_id` aponta para um dispositivo já cadastrado e ativo (reaproveitar o status vindo do módulo de discovery).
- Ao excluir um nível de acesso que ainda tem pessoas vinculadas, exigir confirmação explícita (o HikCentral também bloqueia/avisa nesses casos).
- O cronograma "Modelo para o dia todo" deve existir como seed padrão (24h, todos os dias) para simplificar o cadastro inicial, assim como no HikCentral.
- Ao sincronizar a permissão para o hardware físico (Nice Guarita/leitores faciais), a rotina de sync deve rodar de forma assíncrona (fila) após o `Salvar`, evitando travar a UI — o HikCentral faz isso de forma implícita, mas no OnliAcesso deve ficar explícito (ex. status "Sincronizando..." no nível de acesso até a confirmação de todos os dispositivos).

## Entregáveis esperados

1. Migrations das tabelas acima.
2. Endpoints REST listados.
3. Página de listagem de níveis de acesso.
4. Página de edição com o componente de transfer list em árvore (o componente mais crítico — pode ser desenvolvido isoladamente primeiro como Storybook/teste visual antes de integrar).
5. Página de atribuição de nível a pessoas.
6. Seed de cronograma padrão "Modelo para o dia todo".

Por favor, comece pelas migrations e pelo componente de transfer list em árvore (`AccessPointTransferList`), já que é a peça de UI mais complexa e o restante do CRUD é relativamente padrão.
