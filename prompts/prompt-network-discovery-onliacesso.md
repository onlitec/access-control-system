# Prompt: Descoberta Automática de Dispositivos CFTV/Acesso — OnliAcesso

## Contexto do projeto

Estou trabalhando no **OnliAcesso**, um sistema web de controle de acesso condominial (Next.js/Vite no frontend, Node.js no backend, PostgreSQL como banco, Nginx como proxy). O sistema já integra com hardware IP da Nice Guarita e segue a regra arquitetural de ser **independente do HikCentral** — todos os dados vêm exclusivamente do PostgreSQL local.

Quero implementar uma página de **"Integrações"** que faça descoberta automática de dispositivos CFTV/acesso na rede local (câmeras IP, NVRs, leitores faciais, interfones, controladoras de portão), no mesmo espírito do que o **SADP Tool** (Hikvision) e o **iVMS-4200/HikCentral** fazem: escanear a rede, identificar os dispositivos encontrados (modelo, fabricante, IP, MAC, status), e permitir que o operador clique para cadastrá-los na plataforma.

## Objetivo

Implementar um módulo de **network discovery** no OnliAcesso com:
1. Backend (serviço Node.js) que varre a rede local e identifica dispositivos CFTV/acesso.
2. Frontend com uma tela de "Integrações" que dispara a busca, exibe os resultados em tempo real e permite cadastro com um clique.

## Protocolos de descoberta a implementar (em camadas, do mais confiável ao mais genérico)

### 1. ONVIF WS-Discovery (prioridade alta)
- A maioria dos fabricantes (Intelbras, Dahua, Hikvision, Control iD, etc.) suporta ONVIF.
- Enviar probe multicast UDP para `239.255.255.250:3702` com mensagem SOAP `Probe` do WS-Discovery.
- Parsear respostas `ProbeMatch` para extrair: `XAddrs` (URL do serviço), tipos de dispositivo (`NetworkVideoTransmitter`, `Device` etc).
- Em seguida, chamar `GetDeviceInformation` e `GetCapabilities` via SOAP no endpoint retornado para obter fabricante, modelo, firmware, número de série.
- Sugestão de lib: `node-onvif` ou implementação manual do SOAP via `axios` + XML (mais controle e menos dependência frágil).

### 2. SADP-like (protocolo Hikvision, UDP broadcast)
- Hikvision (e OEMs como Intelbras que usam o mesmo core) respondem a broadcast UDP na porta `37020`.
- Pacote de descoberta é XML simples enviado via broadcast (`255.255.255.255:37020`).
- Útil porque retorna informação mesmo de dispositivos com IP ainda não configurado (device on different subnet flag), o que o ONVIF puro não cobre tão bem.
- Implementar como serviço opcional/plugin — não é padrão aberto documentado oficialmente, então tratar com try/catch robusto e timeout curto.

### 3. mDNS/Bonjour (fallback para terminais faciais e interfones IP)
- Muitos leitores faciais e interfones (ex.: Control iD, Intelbras) anunciam-se via mDNS.
- Usar lib `bonjour-service` ou `multicast-dns` para escutar anúncios `_http._tcp.local` e `_rtsp._tcp.local`.

### 4. Varredura ativa (fallback final, rede sem multicast/broadcast habilitado)
- ARP scan na sub-rede local (`node-arp` ou `arp-scan` via `child_process`) para listar hosts ativos.
- Para cada host encontrado, port scan leve nas portas típicas: `80` (HTTP admin), `443`, `554` (RTSP), `8000` (SDK Hikvision), `37777` (Dahua).
- Cruzar o **OUI do MAC address** (primeiros 3 octetos) com uma tabela de fabricantes conhecidos (Hikvision, Dahua, Intelbras, Control iD) para inferir o fabricante quando ONVIF/SADP não respondeu.
- Esta camada é mais lenta — rodar em background e reportar resultados incrementalmente.

## Arquitetura sugerida no backend

```
/backend
  /modules
    /discovery
      onvifDiscovery.service.ts      // WS-Discovery + GetDeviceInformation
      sadpDiscovery.service.ts       // broadcast UDP 37020
      mdnsDiscovery.service.ts       // bonjour/mDNS
      arpScan.service.ts             // fallback ativo
      discovery.orchestrator.ts      // roda as 4 camadas em paralelo, deduplica por MAC/IP
      discovery.controller.ts        // expõe endpoints REST + WebSocket
      device-fingerprint.util.ts     // tabela OUI -> fabricante, inferência de tipo
```

### Fluxo de execução
1. Operador clica em "Buscar dispositivos" na página de Integrações.
2. Backend recebe `POST /api/discovery/scan` (parâmetros opcionais: range de sub-rede, timeout).
3. Orquestrador dispara ONVIF + SADP + mDNS em paralelo (timeout ~5s cada) e, se habilitado, o ARP scan em background (~30-60s).
4. Resultados são deduplicados por MAC address e emitidos via **WebSocket/SSE** (`discovery:device-found`) conforme chegam — não esperar o scan completo terminar para começar a exibir.
5. Cada dispositivo encontrado carrega: IP, MAC, fabricante (inferido ou via ONVIF), modelo, tipo provável (câmera/NVR/leitor facial/interfone/controladora), status de já cadastrado ou não no PostgreSQL (cruzar por MAC/IP).
6. Endpoint `POST /api/discovery/register` recebe o dispositivo selecionado + credenciais (usuário/senha do device) e persiste no PostgreSQL, seguindo o modelo de dados já existente do OnliAcesso para dispositivos Nice Guarita — reaproveitar a mesma tabela/abstração se fizer sentido, ou criar tabela `network_devices` com um campo `protocol_type` (onvif/sadp/nice/manual).

## Frontend — Página de Integrações

- Tela com botão "Buscar na rede" que inicia o scan e mostra um indicador de progresso (streaming, não um spinner bloqueante).
- Lista/tabela de dispositivos encontrados, em tempo real, com colunas: ícone por tipo, IP, MAC, fabricante, modelo, status (novo / já cadastrado).
- Cada linha "novo" tem botão "Cadastrar" que abre um modal pedindo: nome amigável, localização (torre/bloco), credenciais de acesso ao device, e associação com o tipo de integração correta do sistema.
- Filtro por tipo de dispositivo (câmera, NVR, leitor facial, interfone, controladora).
- Estado vazio com dica caso nenhum dispositivo seja encontrado (ex.: "verifique se o dispositivo está na mesma rede/VLAN do servidor").

## Considerações de segurança e infraestrutura

- **Rede/VLAN**: multicast (ONVIF) e broadcast (SADP) não atravessam roteadores/VLANs por padrão. O serviço de discovery precisa rodar em um host/container com acesso à mesma L2 dos dispositivos CFTV — importante avisar isso na doc, especialmente dado que Calabasas tem sub-redes duplas (dual subnet, ~130 câmeras). Pode ser necessário um agente leve por sub-rede/torre, ou habilitar IP helper/multicast relay no MikroTik.
- Nunca armazenar credenciais de dispositivo em texto plano — reaproveitar o esquema de criptografia já usado no OnliAcesso para credenciais Nice Guarita.
- Rate-limit no endpoint de scan para evitar flood de broadcast disparado repetidamente.
- Logar todas as tentativas de descoberta e cadastro para auditoria (LGPD/compliance, considerando que já existe preocupação similar documentada no OnliFin).

## Entregáveis esperados

1. Serviços de descoberta (ONVIF, SADP, mDNS, ARP fallback) com interface unificada retornando um tipo `DiscoveredDevice` comum.
2. Endpoint REST + WebSocket/SSE para iniciar scan e streamar resultados.
3. Endpoint de cadastro que persiste o dispositivo no PostgreSQL.
4. Página de Integrações no frontend consumindo esses endpoints, com UX em tempo real similar ao SADP Tool/iVMS.
5. Tabela de mapeamento OUI → fabricante para os principais fabricantes usados nos projetos (Hikvision, Intelbras, Dahua, Control iD, Nice).
6. Documentação curta sobre requisitos de rede (necessidade de estar na mesma VLAN/L2, portas UDP usadas: 3702, 37020, 5353).

Por favor, implemente começando pelo `discovery.orchestrator.ts` e pelo `onvifDiscovery.service.ts`, já que ONVIF é o protocolo mais confiável e cobre a maior parte dos dispositivos. Depois seguimos com SADP e o fallback ARP.
