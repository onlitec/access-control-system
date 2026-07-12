# Prompt: Cadastro Manual de Dispositivos e Gestão de Áreas — OnliAcesso (modelo HikCentral)

## Contexto do projeto

Continuação dos módulos já especificados no OnliAcesso (Next.js/Vite, Node.js, PostgreSQL, Nginx, independente do HikCentral):
1. Descoberta automática de dispositivos (`network_devices`, discovery ONVIF/SADP/mDNS/ARP).
2. Níveis de Acesso (`access_levels`, `access_points`, `access_areas`).
3. Gestão de Dispositivos (tela com adicionados + online).

Agora quero implementar duas peças que faltam, com base no print anexado ("Adicionar codificador" do HikCentral):

**A. Formulário de cadastro manual de dispositivo** — usado quando o operador quer adicionar um dispositivo diretamente (por IP, por faixa de IP, ou importação em lote via CSV), sem depender do resultado do discovery automático.

**B. Gestão de Áreas** — CRUD completo da árvore de áreas (`access_areas`, já criada no módulo de níveis de acesso), com a regra explícita de que **uma área pode agrupar dispositivos de categorias diferentes** (câmera + NVR + leitor facial + interfone no mesmo grupo/local físico), e que o vínculo dispositivo→área é **opcional** (dispositivo pode não pertencer a nenhuma área).

## A. Formulário "Adicionar dispositivo" (modal ou página, replicando o print)

### Campos (seguindo exatamente o formulário do HikCentral, adaptado)

- **Protocolo de acesso** (dropdown): no OnliAcesso deve listar os protocolos suportados pelo discovery — `ONVIF`, `SADP (Hikvision/OEM)`, `Nice Guarita`, `Manual/Genérico` — em vez de travado em "Protocolo privado Hikvision".
- **Modo de adição** (radio buttons):
  - `Endereço IP/domínio` — cadastro de um único dispositivo.
  - `Segmento IP` — informa um range (ex. `10.10.1.1` a `10.10.1.254`) e o backend varre e tenta identificar todos os dispositivos ativos nesse range (reaproveita o `arpScan.service.ts` + tentativa de handshake ONVIF/SADP em cada IP do range).
  - `Importar em lote` — upload de CSV/XLSX com colunas `ip, porta, usuario, senha, nome, categoria, area` (reaproveitar lib já usada no projeto para leitura de planilha, dado que OnliDesk já usa Excel export/import).
  - Link "Mostrar tudo" — expande campos avançados (porta mapeada, chave de criptografia de fluxo) que ficam ocultos por padrão para não sobrecarregar o operador comum.
- **Endereço de dispositivo*** (obrigatório) — IP ou domínio.
- **Adicionar por Encriptação** (checkbox) — quando marcado, habilita campo de "Verificar a chave de criptografia de fluxo" (usado por câmeras Hikvision com stream encryption; no caso de dispositivos ONVIF genéricos, ocultar esse campo).
- **Porta do dispositivo*** (obrigatório, default `8000` para protocolo Hikvision/SADP, `80` para ONVIF/HTTP puro) — com texto de ajuda explicando onde encontrar essa porta nas configurações de rede do próprio dispositivo.
- **Porta mapeada** (campo avançado, opcional) — usado quando o dispositivo está atrás de NAT/port-forward, comum em Calabasas com câmeras em sub-redes diferentes do servidor.
- **Nome do dispositivo*** (obrigatório) — nome amigável, equivale a `friendly_name` na tabela `network_devices`.
- **Nome do usuário*** (obrigatório, default sugerido `admin`).
- **Senha*** (obrigatório, campo mascarado).
- **Área** (campo adicional que o HikCentral não mostra nesse formulário mas que quero incluir aqui) — dropdown em árvore para já vincular o dispositivo a uma área no momento do cadastro, com opção "Sem área definida".
- **Categoria** (campo adicional) — dropdown com as categorias já definidas em `device_categories` (codificação, controle de acesso, terminal facial, interfone, transmissão de rede).

### Botões
- **Adicionar** — salva e volta para a listagem.
- **Adicionar e continuar** — salva e limpa o formulário para cadastrar o próximo (útil ao cadastrar vários dispositivos manualmente em sequência, como nas 175 unidades da Calabasas).

### Validações
- Testar a conexão com o dispositivo (handshake no protocolo selecionado) antes de persistir — mostrar spinner "Testando conexão..." e erro claro se falhar (IP inacessível, credenciais inválidas, porta fechada), similar ao comportamento do HikCentral que rejeita adição se não conseguir autenticar.
- No modo "Segmento IP" e "Importar em lote", processar de forma assíncrona (fila) e mostrar uma tela de progresso com resultado por linha (sucesso/erro/motivo), não travar a UI esperando todos os dispositivos.

## B. Gestão de Áreas (`/dispositivos/areas`)

### Modelo de dados
Já existe `access_areas` (id, name, parent_id) do módulo de níveis de acesso — reaproveitar integralmente, sem criar tabela nova. Adicionar apenas:

```sql
ALTER TABLE access_areas
  ADD COLUMN description TEXT,
  ADD COLUMN is_favorite BOOLEAN DEFAULT false; -- equivale à "estrela" no menu do HikCentral
```

### Regra de negócio central (conforme solicitado)
- Uma área **não é restrita por categoria de dispositivo** — o campo `network_devices.area_id` aceita qualquer dispositivo, independente de `category_id`. Uma área como "Portaria Torre 1" pode conter simultaneamente câmeras, um leitor facial e um interfone.
- O vínculo é **opcional**: `network_devices.area_id` permite `NULL`. Um dispositivo pode existir cadastrado sem pertencer a nenhuma área (aparece num grupo "Sem área" na árvore/listagem).
- Uma área pode ter sub-áreas (`parent_id`), formando hierarquia livre (ex. "Condomínio Calabasas" → "Torre 1" → "Portaria").
- Excluir uma área com dispositivos vinculados deve pedir confirmação e oferecer a opção de mover os dispositivos para "Sem área" ou para outra área, em vez de bloquear a exclusão silenciosamente.

### Endpoints
```
GET    /api/areas/tree              // árvore completa, cada nó com contagem de dispositivos vinculados
POST   /api/areas                   // cria área (name, parent_id?, description?)
PUT    /api/areas/:id                // edita nome/descrição/favorito
DELETE /api/areas/:id?moveDevicesTo= // exclui, com destino opcional para os dispositivos órfãos
PUT    /api/areas/:id/devices        // vincula/desvincula dispositivos em lote (array de device_ids)
GET    /api/areas/:id/devices        // lista dispositivos de uma área (mistos, qualquer categoria)
```

### Frontend
- Tela em árvore (mesmo padrão visual do menu lateral "Área" já existente na Gestão de Dispositivos), com:
  - Botão "Nova área" / "Nova sub-área" (clique com o nó pai selecionado).
  - Drag-and-drop de dispositivos da listagem principal para dentro de um nó da árvore (ação equivalente a `PUT /api/areas/:id/devices`).
  - Ícone de estrela para marcar área como favorita (aparece fixada no topo do menu lateral, como no print original do HikCentral).
  - Ao clicar numa área, mostrar à direita a lista de todos os dispositivos vinculados, **sem filtrar por categoria** — misturando câmeras, NVRs, leitores faciais e interfones na mesma tabela, com um badge indicando o tipo de cada linha.

## Entregáveis esperados

1. Migration da extensão de `access_areas` (description, is_favorite).
2. Endpoint de teste de conexão (`POST /api/devices/test-connection`) reaproveitado tanto pelo cadastro manual quanto pelo modo "Segmento IP".
3. Formulário "Adicionar dispositivo" com os três modos de adição (IP único, segmento, importação em lote).
4. Tela de Gestão de Áreas com árvore, drag-and-drop e listagem mista de dispositivos por área.
5. Endpoints de área listados acima.

Por favor, comece pelo formulário de cadastro manual no modo "Endereço IP/domínio" (o caso mais simples e mais usado), depois implemente o teste de conexão, e só então trate os modos "Segmento IP" e "Importar em lote", que são extensões do mesmo fluxo.
