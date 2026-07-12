# Relatório de Implementação — Sistema de Controle de Acesso OnliAcesso

Este relatório documenta detalhadamente todos os módulos, arquiteturas, esquemas de banco de dados, rotas, telas e testes que foram implementados para a independência do controle de acessos da plataforma OnliAcesso em relação ao HikCentral Professional.

---

## 1. Arquitetura e Filosofia do Sistema
A premissa fundamental do **OnliAcesso** é a autonomia operacional. Toda a gestão de hardware, áreas físicas, moradores e níveis de acesso foi centralizada no banco de dados local PostgreSQL (via Prisma ORM), permitindo que a plataforma gerencie e sincronize os dispositivos diretamente sem depender de servidores VMS/ACS intermediários (como HikCentral ou OEM).

---

## 2. Módulo 1: Network Discovery (Descoberta Automática de Dispositivos)
Implementamos uma arquitetura de descoberta de rede em 4 camadas concorrentes, rodando no backend de forma assíncrona com deduplicação por endereço MAC/IP e transmissão em tempo real via **Server-Sent Events (SSE)**.

- **Camada 1 (ONVIF WS-Discovery):** Varre a rede enviando sondas XML SOAP multicast (`239.255.255.250:3702`). Ao receber respostas, consulta o método SOAP `GetDeviceInformation` para obter marca, modelo, versão de firmware e número de série de câmeras e gravadores.
- **Camada 2 (SADP Protocol):** Protocolo proprietário Hikvision baseado em broadcast UDP (`255.255.255.255:37020`). Identifica dispositivos na rede local mesmo se estiverem sem IP configurado ou em sub-redes diferentes.
- **Camada 3 (mDNS / Bonjour):** Escuta serviços Bonjour (`_http._tcp`, `_rtsp._tcp`, `_onvif._tcp`) na porta multicast `5353` para descobrir terminais faciais inteligentes (como Control iD e Intelbras).
- **Camada 4 (Active ARP Scan & Port Probe):** Mecanismo de varredura ativa. Executa pings simultâneos no range da sub-rede local, lê a tabela ARP do sistema operacional (`arp -a`) e realiza um scan de portas TCP (portas `80`, `443`, `554`, `8000`, `8080`, `37777`) para identificar dispositivos que bloqueiam multicast ou broadcast.
- **Deduplicação & Impressão Digital (OUI):** Tabela interna que correlaciona os 3 primeiros octetos do MAC Address (OUI) com o fabricante correspondente (Hikvision, Dahua, Intelbras, Control iD, Axis, Bosch, Uniview).

---

## 3. Módulo 2: Gestão de Dispositivos (CRUD e Monitoramento)
Desenvolvemos o CRUD central de hardware e painel administrativo integrado.

- **Criptografia de Credenciais:** Todas as senhas de comunicação com dispositivos são criptografadas localmente via **AES-256-GCM** com vetor de inicialização dinâmico (IV) e chave baseada em PBKDF2/Scrypt, impossibilitando vazamento de dados. As senhas são omitidas de todas as respostas HTTP da API.
- **Verificação de Status Ativa (TCP Ping):** Um mecanismo rápido que realiza handshakes TCP nas portas de gerenciamento do dispositivo para classificar seu status em tempo real (`online`, `offline`, `unknown` ou `error`) salvando logs de histórico em `device_sync_logs`.
- **Ações em Lote (Bulk Actions):** Interface e rotas para atualização massiva de senhas e sincronização de fuso horário (timezone) entre dispositivos do condomínio.
- **Bloqueio de Exclusão por Integridade:** Se um dispositivo de controle de acesso (leitor facial/controladora) possuir portas ativas vinculadas a níveis de acesso ativos, a API bloqueia a exclusão retornando `400 Bad Request` com a lista de dependências físicas impeditivas.

---

## 4. Módulo 3: Cadastro Manual e Áreas Hierárquicas (Organograma)
Refatoramos o conceito de Áreas do condomínio para suportar o gerenciamento físico complexo de grandes empreendimentos.

- **Recursividade Lógica (Sub-áreas):** Adição de campo `parentId` com auto-relacionamento (árvore de dependências) na tabela `access_areas`. Permite aninhamento infinito de locais (Ex: *Condomínio Calabasas* -> *Torre A* -> *Hall Social* -> *Elevador 1*).
- **Favoritos (isFavorite):** Permite marcar áreas prioritárias (portarias, portões de veículos) para destaque no menu administrativo rápido.
- **Relação Direta de Dispositivos:** Dispositivos cadastrados (`NetworkDevice`) agora apontam diretamente para a `AccessArea` à qual pertencem. Ao excluir uma área, o sistema permite opcionalmente transferir em cascata os dispositivos órfãos para outra área física ou desvinculá-los.
- **Árvore Recursiva de API:** Rota `/api/access-areas/tree` constrói a árvore física e computa de forma recursiva a contagem agregada de dispositivos online/offlines presentes no nó e em todos os seus sub-nós filhos.

---

## 5. Mapeamento de Arquivos Criados e Modificados

### 🗄️ Banco de Dados (Prisma ORM)
- **[`backend-api/prisma/schema.prisma`](file:///e:/projeto_acesso/access-control-system/backend-api/prisma/schema.prisma)** — Atualização das tabelas `AccessArea` e `NetworkDevice`. Criação das tabelas `DeviceCategory` e `DeviceSyncLog`.
- **[`backend-api/prisma/migrations/20260711200000_add_network_discovery`](file:///e:/projeto_acesso/access-control-system/backend-api/prisma/migrations/20260711200000_add_network_discovery/migration.sql)** — Migration SQL para tabelas do Discovery e seed inicial.
- **[`backend-api/prisma/migrations/20260712000000_add_access_area_hierarchy`](file:///e:/projeto_acesso/access-control-system/backend-api/prisma/migrations/20260712000000_add_access_area_hierarchy/migration.sql)** — Migration SQL para suporte a auto-relacionamento e FKs de áreas físicas.

### ⚙️ Backend (Serviços e Rotas)
- **[`backend-api/src/modules/discovery/device-fingerprint.util.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/device-fingerprint.util.ts)** — Utilitário de fingerprints e tabela OUI.
- **[`backend-api/src/modules/discovery/onvifDiscovery.service.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/onvifDiscovery.service.ts)** — WS-Discovery multicast SOAP.
- **[`backend-api/src/modules/discovery/sadpDiscovery.service.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/sadpDiscovery.service.ts)** — SADP Hikvision broadcast.
- **[`backend-api/src/modules/discovery/mdnsDiscovery.service.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/mdnsDiscovery.service.ts)** — Listener Bonjour mDNS local.
- **[`backend-api/src/modules/discovery/arpScan.service.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/arpScan.service.ts)** — Ping sequencial e leitura ARP do SO.
- **[`backend-api/src/modules/discovery/discovery.orchestrator.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/discovery.orchestrator.ts)** — Orquestrador e SSE broker.
- **[`backend-api/src/routes/discovery.routes.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/routes/discovery.routes.ts)** — Endpoints do scanner e SSE stream.
- **[`backend-api/src/routes/devices.routes.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/routes/devices.routes.ts)** — Endpoints do CRUD de dispositivos de rede, sync e bulk actions.
- **[`backend-api/src/routes/access-areas.routes.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/routes/access-areas.routes.ts)** — Endpoints da árvore recursiva e vinculador de dispositivos.
- **[`backend-api/src/index.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/index.ts)** — Registro global das rotas no Express.

### 🖥️ Frontend (Painel Administrativo)
- **[`frontend-admin/src/components/NetworkDiscoverySection.tsx`](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/components/NetworkDiscoverySection.tsx)** — Componente de varredura ativa em tempo real.
- **[`frontend-admin/src/pages/IntegrationsPage.tsx`](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/IntegrationsPage.tsx)** — Integração da seção de varredura de rede no painel de configurações.
- **[`frontend-admin/src/pages/NetworkDevicesPage.tsx`](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/NetworkDevicesPage.tsx)** — Nova tela principal de Gestão de Dispositivos e Servidores (sidebar categorias/áreas, tabela superior, scanner inferior).
- **[`frontend-admin/src/pages/AccessAreasPage.tsx`](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/AccessAreasPage.tsx)** — Reescreve a tela com painel split (árvore colapsável de áreas e abas de vinculação de portas e dispositivos).
- **[`frontend-admin/src/components/AdminLayout.tsx`](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/components/AdminLayout.tsx)** — Adiciona a entrada de Dispositivos e Servidores no menu lateral.
- **[`frontend-admin/src/App.tsx`](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/App.tsx)** — Roteamento do react-router-dom para a nova tela.

### 🧪 Testes de Integração
- **[`backend-api/src/tests/devices.test.ts`](file:///e:/projeto_acesso/access-control-system/backend-api/src/tests/devices.test.ts)** — Suíte de testes de integração Vitest para o fluxo completo de CRUD de dispositivos, omissão de credenciais e integridade das árvores de acesso.

---

## 6. Próximos Passos Recomendados
Com a infraestrutura de descoberta de rede, gestão de hardware locais e organograma hierárquico prontos, os próximos passos planejados são:
1. **Cadastro Manual Avançado:** Desenvolver suporte para importação massiva de dispositivos via planilhas CSV.
2. **Níveis de Acesso Dinâmicos:** Regras automatizadas de passback, controle de lotação, e agendamento de permissões horárias por perfil de morador.
