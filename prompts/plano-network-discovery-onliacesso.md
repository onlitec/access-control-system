# Plano de Implementação: Descoberta Automática de Dispositivos CFTV/Acesso — OnliAcesso

Este plano descreve a implementação da descoberta automática de dispositivos de rede CFTV e controle de acesso (câmeras IP, NVRs, leitores faciais, interfones e controladoras) no sistema **OnliAcesso**, operando de forma totalmente standalone a partir da rede local condominial.

## User Review Required

> [!IMPORTANT]
> A descoberta automática de dispositivos via protocolos multicast (ONVIF) e broadcast (SADP) depende estritamente de o servidor OnliAcesso estar na mesma sub-rede/VLAN (Layer 2) que os dispositivos físicos de CFTV/Acesso. Caso o condomínio utilize sub-redes distintas para câmeras e controle de acesso, será necessário habilitar um relé de multicast (IP Helper/Multicast Relay no MikroTik/Switch) ou documentar que o scanner deve rodar com ARP scan ativo em ranges de IP configurados pelo operador.

## Proposed Changes

### Banco de Dados (Prisma ORM)

#### [NEW] [schema.prisma](file:///e:/projeto_acesso/access-control-system/backend-api/prisma/schema.prisma)
Adicionar a model `NetworkDevice` que servirá de repositório comum para dispositivos descobertos e cadastrados:

```prisma
model NetworkDevice {
  id               String          @id @default(cuid())
  macAddress       String          @unique @map("mac_address")
  ipAddress        String          @map("ip_address")
  port             Int             @default(80)
  protocolType     String          @map("protocol_type") // "onvif" | "sadp" | "mdns" | "arp"
  manufacturer     String?
  model            String?
  serialNumber     String?         @unique @map("serial_number")
  firmwareVersion  String?         @map("firmware_version")
  isAdded          Boolean         @default(false) @map("is_added")
  lastDiscoveredAt DateTime        @default(now()) @map("last_discovered_at")
  
  // Extensões para a Gestão de Dispositivos (Módulo posterior)
  categoryId       String?         @map("category_id")
  category         DeviceCategory? @relation(fields: [categoryId], references: [id])
  areaId           String?         @map("area_id")
  area             AccessArea?     @relation(fields: [areaId], references: [id])
  friendlyName     String?         @map("friendly_name")
  channelCount     Int             @default(0) @map("channel_count")
  httpPort         Int             @default(80) @map("http_port")
  sdkPort          Int             @default(8000) @map("sdk_port")
  subnetMask       String?         @map("subnet_mask")
  gateway          String?
  dhcpEnabled      Boolean         @default(false) @map("dhcp_enabled")
  credentialUsername String?       @map("credential_username")
  credentialPasswordEncrypted String? @map("credential_password_encrypted")
  status           String          @default("unknown") // "online" | "offline" | "error" | "unknown"
  lastSyncAt       DateTime?       @map("last_sync_at")
  syncLogs         DeviceSyncLog[]
  accessPoints     AccessPoint[]

  createdAt        DateTime        @default(now()) @map("created_at")
  updatedAt        DateTime        @updatedAt @map("updated_at")

  @@map("network_devices")
}
```

---

### Backend (Serviços e Orquestração)

#### [NEW] [onvifDiscovery.service.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/onvifDiscovery.service.ts)
Serviço responsável pelo scan ONVIF WS-Discovery.
- Envia probe UDP multicast para `239.255.255.250:3702`.
- Realiza parse das respostas SOAP `ProbeMatch`.
- Faz chamadas adicionais SOAP `GetDeviceInformation` e `GetCapabilities` para extrair fabricante, modelo e número de série.

#### [NEW] [sadpDiscovery.service.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/sadpDiscovery.service.ts)
Serviço de scan estilo SADP (Hikvision/OEM).
- Envia pacote XML de descoberta via UDP broadcast para `255.255.255.255:37020`.
- Parseia as respostas contendo endereços IP, máscara, gateway, status de ativação do dispositivo e MAC.

#### [NEW] [mdnsDiscovery.service.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/mdnsDiscovery.service.ts)
Serviço mDNS (Bonjour).
- Escuta serviços locais do tipo `_http._tcp.local` e `_rtsp._tcp.local` usando a lib `bonjour-service` para identificar leitores faciais e interfones na rede condominial.

#### [NEW] [arpScan.service.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/arpScan.service.ts)
Serviço de varredura ativa de rede (ARP + Port Scan).
- Roda comando ARP na sub-rede local (`node-arp` ou parsing do `arp -a` no Windows) para listar IPs e MACs ativos.
- Para cada IP ativo, executa um port scan rápido nas portas chaves (`80`, `443`, `554`, `8000`, `37777`).

#### [NEW] [device-fingerprint.util.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/device-fingerprint.util.ts)
Utilitário para identificação/impressão digital do fabricante através do prefixo do endereço MAC (OUI).
- Tabela interna de mapeamento (ex: `00:1F:3F` -> Hikvision, `00:23:45` -> Intelbras/Dahua, etc.).

#### [NEW] [discovery.orchestrator.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/modules/discovery/discovery.orchestrator.ts)
Orquestrador central de descoberta.
- Roda as 4 estratégias de varredura concorrentemente com timeouts gerenciados.
- Deduplica os resultados por endereço MAC.
- Emite eventos de descoberta em tempo real (`discovery:device-found`) usando `EventBusService` ou SSE.

#### [NEW] [discovery.routes.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/routes/discovery.routes.ts)
Rotas HTTP para interação com a descoberta:
- `POST /api/discovery/scan` - Inicia a varredura (recebe parâmetros opcionais de sub-rede e timeout).
- `GET /api/discovery/stream` - Endpoint SSE (Server-Sent Events) para transmitir os dispositivos encontrados incrementalmente para o frontend.
- `POST /api/discovery/register` - Endpoint para cadastrar/adicionar um dispositivo descoberto na base de dados com as credenciais fornecidas.

#### [MODIFY] [index.ts](file:///e:/projeto_acesso/access-control-system/backend-api/src/index.ts)
Montar as novas rotas em `/api/discovery`.

---

### Frontend

#### [NEW] [IntegrationsPage.tsx](file:///e:/projeto_acesso/access-control-system/frontend-admin/src/pages/IntegrationsPage.tsx)
Tela de descoberta e integração:
- Cabeçalho com botão "Buscar na rede" e indicador de progresso dinâmico.
- Lista em grid ou tabela com ícones baseados no tipo do dispositivo (Câmeras, Controladoras, Faciais, Interfones).
- Filtros por tipo de dispositivo e status (Novo / Já Cadastrado).
- Botão "Cadastrar" que abre um modal para inserir credenciais (usuário e senha criptografados), definir o nome amigável e a área condominial vinculada.

---

## Verification Plan

### Automated Tests
- Testes unitários para o `device-fingerprint.util.ts` garantindo que OUIs mapeiem corretamente para os fabricantes.
- Testes de integração em `Vitest` para a rota `/api/discovery/scan` mockando respostas dos sockets UDP.

### Manual Verification
- Executar o scan em ambiente de homologação condominial com dispositivos físicos (Hikvision e ONVIF) conectados à rede local e validar se aparecem em tempo real no console do operador.
- Tentar cadastrar um dispositivo a partir da tela de descobertas e validar se o registro é persistido na tabela `network_devices`.
