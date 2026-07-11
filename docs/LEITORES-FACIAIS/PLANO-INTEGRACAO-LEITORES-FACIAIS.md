# Planejamento — Integração com Leitores Faciais, Controladoras e Níveis de Acesso

**Status:** planejamento — equipamento ainda não instalado na rede · **Última atualização:** 07/07/2026

Este documento mapeia o hardware, avalia as rotas de protocolo disponíveis e propõe a arquitetura de integração dos terminais de reconhecimento facial Hikvision ao OnliAcesso — incluindo duas extensões identificadas nesta revisão: **gestão de níveis de acesso** (quais portas/portões/cancelas cada nível libera, e se leitores faciais entram ou não em cada nível) e **topologia de controladoras** (o leitor facial pode ser standalone ou funcionar como satélite de uma controladora tipo DS-K2812, que aciona porta/portão/cancela em conjunto com ele). Segue o mesmo rigor e os mesmos padrões já usados na integração do módulo de guarita Nice/Linear-HCS MG3000 (ver `docs/ONLIACESSO-VISAO-GERAL.md`, seção 4.1). **Nenhum código foi alterado para produzir este documento** — é uma etapa de planejamento, a ser validada fisicamente quando o equipamento chegar (Fase 0, seção 9).

---

## 1. Resumo executivo

- **Hardware identificado:** terminal de reconhecimento facial **Hikvision DS-K1T673DX** (variante DS-K1T673DBWFX com Wi-Fi/Bluetooth também referenciada) e a **controladora de acesso Hikvision DS-K2812** (manual já obtido, `docs/CONTROLADORAS/`) — um equipamento de rede diferente, de **2 portas**, que faz a decisão de acesso e aciona a fechadura/portão/cancela, com leitores (inclusive faciais) conectados a ela via **1 barramento RS-485 compartilhado** ou **4 interfaces Wiegand** (tipicamente 2 por porta), em vez de ligados direto na rede IP.
- **Duas topologias de hardware a suportar** (detalhe na seção 3): (a) **terminal facial standalone** — tudo em um só, câmera+reconhecimento+relé, endereçável por IP, é o que o DS-K1T673 é por padrão; (b) **controladora + leitor(es) satélite** — a controladora (DS-K2812) é o único equipamento com IP na rede, e um ou mais leitores (faciais, de cartão, ou ambos) são cabeados a ela localmente por RS-485/Wiegand, sem endereço de rede próprio.
- **Nível de acesso passa a ser um conceito de primeira classe**, transversal a todos os tipos de hardware (Guarita, terminal facial, controladora) — hoje o projeto já tem uma base parcial (`AccessArea`/`ResidentAccessArea`), mas ela é só um rótulo/etiqueta (nome, ícone) sem vínculo a nenhuma porta física. Também já existe um mecanismo de nível de acesso real, só que restrito ao Guarita: `receiverBitmask` (bitmask de até 8 bits gravado no cadastro do controle no MG3000, controlando quais receptores/portões aquele controle pode acionar — ver `backend-api/src/providers/NiceGuaritaProvider.ts:117-118`, `backend-api/src/services/NiceGuaritaProtocol.ts:75,155`). Este plano propõe generalizar essa ideia para todos os tipos de hardware.
- **Dois caminhos de protocolo possíveis para o Hikvision (terminal e controladora):** o SDK nativo (binário, proprietário, porta TCP 8000, DLL Win32) — totalmente documentado e provado nos demos que vieram no pacote, e válido tanto para terminal quanto para controladora, já que o HCNetSDK trata os dois como "dispositivo ACS" genérico — e o ISAPI (HTTP), listado no datasheet do terminal como suportado, mas **sem documentação de endpoints incluída no pacote**.
- **Recomendação:** ISAPI como rota principal (mesmos motivos de sempre: reaproveita `digestFetch` de `VideoDoorbellService.ts`, sem dependência nativa Win32, sem risco de derrubar o processo do backend). SDK nativo como fallback documentado.

---

## 2. Mapeamento de hardware e do pacote do SDK

### 2.1 Especificações do terminal (DS-K1T673DX)

| Característica | Valor |
|---|---|
| Tela | 7" touchscreen |
| Câmera | 2 MP, grande angular |
| Distância/tempo de reconhecimento | 0,3–3 m / 0,2 s por pessoa |
| Reconhecimento simultâneo | até 5 pessoas |
| Capacidade | 50.000 faces / 50.000 cartões / 10.000 digitais (módulo opcional) / 300.000 eventos |
| Extras | medição de temperatura (30–45°C) e detecção de máscara, opcionais |
| E/S | 1 alarme in, 1 alarme out, 1 USB, RS-485, Wiegand, 1 saída de relé de fechadura, entrada de botão de saída, entrada de contato de porta, tamper switch |
| Alimentação | 12–24 VDC / 2A |
| Proteção | IP65 |
| SO | Linux embarcado |
| Protocolos suportados (datasheet) | **ISAPI, ISUP 5.0, TCP/IP (IPv4/IPv6)** |

O relé de fechadura é embutido (bloco "Door Lock", contatos COM/NO) — o equipamento aciona a fechadura/catraca diretamente, sem controlador intermediário, inclusive por reconhecimento facial local sem nenhum host conectado. O parâmetro "Open Duration" (config. do próprio equipamento, default 5s) controla por quanto tempo o relé fica energizado — ajustável para uso em catraca.

**Importante:** o mesmo terminal também expõe **RS-485 e Wiegand** — o que significa que ele pode operar em dois papéis: (1) standalone, decidindo e acionando o próprio relé, como descrito acima, ou (2) como **leitor satélite** de uma controladora externa (como a DS-K2812), enviando o resultado do reconhecimento por Wiegand/RS-485 para a controladora decidir e acionar a porta/portão. A escolha do papel é configuração do próprio equipamento, não muda o hardware.

### 2.2 Controladora de acesso Hikvision DS-K2812

Manual localizado em `docs/CONTROLADORAS/DS-K2812-Access-Controller_Datasheet_V1.0_20230817.pdf` e extraído nesta revisão. Especificações confirmadas direto do datasheet:

| Característica | Valor |
|---|---|
| Portas suportadas | **2** (confirma "two-door access control" — o "12" no nome é o modelo, não a contagem de portas) |
| Rede | TCP/IP, 10M/100M auto, **1 interface de rede** — comunicação criptografada |
| Operação offline | Sim — "supports offline operation", dados preservados com energia desligada (bateria de standby) |
| Controle de fechadura (relé) | **2** — um por porta |
| Botão de saída | 2 |
| Contato de porta | 2 |
| Alarme (entrada) | 5 |
| Alarme (saída) | 4 |
| Tamper | 1 |
| **RS-485** | **1 interface** — é um barramento compartilhado entre as 2 portas (leitores endereçados no barramento), não uma porta dedicada por porta |
| **Wiegand** | **4 interfaces**, W26/W34, compatível com leitor de terceiros |
| Funções avançadas | Interligação multiporta, anti-passback, multi-cartão, "first person" (primeira pessoa libera acesso geral), super-cartão e super-senha |
| Capacidade de cartões | 10.000 |
| Capacidade de eventos | 50.000 |
| Alimentação | 100–240 VAC, com conexão para bateria backup |
| Dimensões | 370 × 345 × 90 mm |

**Ponto importante que corrige a suposição anterior deste documento:** o RS-485 é **1 barramento só para o equipamento inteiro** (não um por porta) — leitores RS-485 "inteligentes" (inclusive faciais) precisam de um **endereço no barramento** para a controladora saber a qual porta cada leitura pertence, diferente do Wiegand, que é ponto-a-ponto (cada uma das 4 portas Wiegand é uma conexão física dedicada, tipicamente 2 por porta = entrada/saída). Isso afeta o modelo de leitor na seção 4.3.

**O datasheet não menciona ISAPI, SDK, HCNetSDK, HikCentral ou qualquer detalhe de protocolo de software** — é puramente uma ficha técnica de hardware, no mesmo padrão do datasheet do terminal DS-K1T673 (seção 2.5). A confirmação de protocolo segue pendente para a Fase 0.

No HCNetSDK, comandos como `NET_DVR_ControlGateway(userID, doorNo, action)` já recebem um `doorNo` — ou seja, a mesma API que controla o relé do terminal standalone (`doorNo=1` implícito) generaliza para a DS-K2812 (`doorNo=1..2`). Da mesma forma, os eventos de alarme ACS (`NET_DVR_ACS_ALARM_INFO`) já trazem `dwDoorNo` e `dwCardReaderNo` — o protocolo nativo **já foi desenhado para múltiplas portas e múltiplos leitores por dispositivo**, o que é uma ótima notícia para o modelo de dados (seção 4).

### 2.3 Inventário do pacote SDK (`EN-HCNetSDKV6.1.9.48_build20230410_win64/`)

```
EN-HCNetSDKV6.1.9.48_build20230410_win64/
├── doc/            → 19 PDFs "Developer Guide" (um por módulo do SDK nativo) — ver 2.5
├── incEn/          → headers C: HCNetSDK.h (2,5 MB), DataType.h, DecodeCardSdk.h, plaympeg4.h
├── lib/            → HCNetSDK.dll/.lib (SDK nativo), HCCore.dll, hlog.dll, OpenSSL, libiconv/libxml2/zlib,
│                     + um executável de demo "ClientDemoEn.exe" (GUI MFC gigante, cobre TODOS os produtos Hikvision)
├── ClientDemo/     → fonte C++/MFC do demo universal (~600 diálogos: NVR, PTZ, LED wall, POS, decoders, etc.)
│                     — só uma fatia pequena é relevante (DlgAcsFaceAndTemplate, DlgCaptureFace, DlgFaceData,
│                     DlgDoorConfig, DlgACCardParam, DlgAcsLogSearch); o resto é ruído para este projeto
└── C# demo/        → 9 soluções Visual Studio (.NET Framework, P/Invoke via CHCNetSDK.cs/HCNetSDK.cs)
    ├── 1,2,3,5,6,7,9  → voltadas a vídeo/NVR/PTZ, não relevantes
    └── 8‑ACS_Optimization_ALL/   ★ a pasta relevante para este projeto (vale tanto para terminal quanto p/ controladora)
        ├── CardManagement/        (cadastro/consulta/exclusão de número de cartão)
        ├── ControlDoor/           (abrir/fechar/manter aberto/manter fechado o relé de porta — recebe doorNo)
        ├── DeleteFace/            (excluir template de face)
        ├── EventByDeploy/         (escuta de eventos em tempo real — arma + callback; evento traz doorNo+cardReaderNo)
        ├── FaceManagement/        (cadastro/consulta/exclusão/captura de face — a demo-chave)
        ├── FingerPrintManagement/ (cadastro de digital — mesmo padrão)
        ├── GetACSEvent/           (consulta/pull de eventos históricos do dispositivo)
        ├── HCNetSDK/              (DLL nativa compartilhada; ReadMe: iconv/libxml2/zlib/calib só usados no ClientDemo)
        └── PlanTemplate/          (templates de horário semanal/feriado de acesso — relevante p/ níveis de acesso, seção 4)
```

Também há dois arquivos soltos na raiz de `docs/LEITORES-FACIAIS/`: o manual PT-BR do DS-K1T673DX (datasheet) e um artigo de KB (EN) sobre como usar o sinal de I/O do relé de fechadura no terminal facial (referencia o modelo DS-K1T673DBWFX).

### 2.4 Comandos do SDK nativo relevantes (protocolo binário, porta TCP 8000)

Confirmados nos demos C# de `8-ACS_Optimization_ALL/` — válidos tanto para o terminal quanto (com `doorNo`/`cardReaderNo` variando) para a controladora:

| Operação | Chamada / ID de comando |
|---|---|
| Login | `NET_DVR_Login_V40(ref struLoginInfo, ref struDeviceInfoV40)` → `lUserID` |
| Logout / cleanup | `NET_DVR_Logout_V30(userID)` / `NET_DVR_Cleanup()` |
| Cadastrar face | `NET_DVR_StartRemoteConfig(userID, NET_DVR_SET_FACE=2567, ...)` + loop `NET_DVR_SendWithRecvRemoteConfig` (foto JPEG ≤200KB, associada a um `byCardNo` sintético) + `NET_DVR_StopRemoteConfig` |
| Consultar face | mesmo padrão com `NET_DVR_GET_FACE=2566` |
| Capturar face ao vivo (câmera do terminal) | `NET_DVR_CAPTURE_FACE_INFO=2510` |
| Excluir face | `NET_DVR_RemoteControl(userID, NET_DVR_DEL_FACE_PARAM_CFG=2509, ...)` |
| Cadastro de cartão (análogo) | `NET_DVR_SET_CARD` / `NET_DVR_GET_CARD` / `NET_DVR_DEL_CARD` |
| Armar recepção de eventos | `NET_DVR_SetupAlarmChan_V41(userID, ref param)` |
| Callback de eventos | `NET_DVR_SetDVRMessageCallBack_V50(0, callback, IntPtr.Zero)` — recebe `NET_DVR_ACS_ALARM_INFO` (`dwEmployeeNo`, `byCardNo`, **`dwDoorNo`**, **`dwCardReaderNo`**, `dwVerifyNo`, foto do evento em `pPicData`/`dwPicDataLen`) quando `lCommand == COMM_ALARM_ACS (0x5002)` |
| Abrir/fechar porta/portão/cancela | `NET_DVR_ControlGateway(userID, doorNo, action)` — 0=fechar, 1=abrir, 2=sempre aberto, 3=sempre fechado. `doorNo` seleciona a porta/portão/cancela específica em controladoras multiporta |
| Consultar eventos históricos | `NET_DVR_StartRemoteConfig(userID, NET_DVR_GET_ACS_EVENT, ...)` + `NET_DVR_GetNextRemoteConfig` (paginado) |

Cada face é vinculada a um `byCardNo` — um identificador de "cartão" que funciona como chave da pessoa no equipamento, mesmo em cadastro puramente facial (sem cartão físico). Isso mapeia diretamente para o padrão já usado no projeto (`Person.txSerial`/`cardSerial`).

**Nível de acesso no protocolo nativo:** o módulo `PlanTemplate/` do SDK (templates de horário semanal/feriado) e o major-type `MAJOR_OPERATION`/comandos de "plano de acesso" (não detalhados nos demos lidos até agora) sugerem que o firmware da controladora já tem noção nativa de "quem pode acessar quando" — este é um ponto a explorar mais na Fase 0 física, pois pode ser preferível deixar a controladora aplicar a regra localmente (mais rápido, funciona offline) e o OnliAcesso apenas *sincronizar* a configuração, em vez de o backend decidir a cada evento.

### 2.5 Lacuna confirmada: SDK nativo não documenta ISAPI

Verificação direta feita nesta sessão: o PDF `Device Network SDK (Person-Based Access Control)_Developer Guide_V6.1.7.X_20230330.pdf` (e o datasheet do equipamento) foram inflados e buscados programaticamente pela string "ISAPI" — **zero ocorrências** no guia do SDK nativo. Confirma que os 19 PDFs de `doc/` documentam exclusivamente o protocolo binário (funções `NET_DVR_*`); nenhum deles serve como referência para os endpoints ISAPI do equipamento. A documentação ISAPI do DS-K1T673 (provavelmente sob caminhos como `/ISAPI/AccessControl/UserInfo/*`, `/ISAPI/AccessControl/FaceDataRecord/*`, e configuração de push de eventos por HTTP) **precisa ser obtida separadamente** — via portal de parceiro/distribuidor Hikvision, ou por engenharia reversa/teste direto no equipamento quando ele chegar (ver Fase 0). O mesmo vale para a DS-K2812, cujo manual/datasheet ainda não está no pacote.

---

## 3. As duas topologias de hardware

Esta é a mudança de arquitetura mais importante desta revisão: o OnliAcesso precisa suportar **dois papéis distintos** para hardware facial, sem forçar um modelo de dados que só funcione para um deles.

| | **(A) Terminal standalone** | **(B) Controladora + leitor satélite** |
|---|---|---|
| Exemplo | DS-K1T673 configurado sozinho | DS-K2812 (controladora) + DS-K1T673 (ou leitor facial dedicado) cabeado via RS-485/Wiegand |
| Quem tem IP na rede | O próprio terminal | Só a controladora — o leitor não tem endereço de rede próprio |
| Quem decide o acesso | O terminal, localmente | A controladora (o leitor só entrega o resultado do reconhecimento/o código do cartão) |
| Quem aciona o relé da porta/portão/cancela | O terminal, relé embutido | A controladora, num dos seus `doorNo` |
| Quantas "portas" por dispositivo de rede | 1 (implícita) | N (a controladora pode ter 2+ portas, cada uma com 1+ leitores) |
| Cabo entre leitor e decisor | Não existe (é o mesmo equipamento) | RS-485 (leitores "inteligentes", inclusive faciais) ou Wiegand (leitores simples, geralmente só cartão) |

**Consequência para o modelo de dados:** o dispositivo de rede (o que tem IP, é o que a plataforma acessa por ISAPI/SDK) precisa ser modelado separado do conceito de "porta" (relé físico que abre algo) e do conceito de "leitor" (o que captura a credencial — pode ser facial). No caso (A), dispositivo=porta=leitor são a mesma coisa na prática (1:1:1). No caso (B), um dispositivo (controladora) tem N portas, e cada porta tem 1+ leitores. O modelo de dados da seção 4 é desenhado para cobrir os dois casos sem duplicar conceitos.

---

## 4. Modelo de dados proposto

### 4.1 Dispositivo de rede (terminal OU controladora)

Reaproveita o padrão flat já usado em `GuaritaDevice`/`DoorbellDevice`, mas cobre os dois papéis da seção 3:

```prisma
model FacialAccessDevice {
  id        String   @id @default(cuid())
  name      String
  role      String   @default("standalone_terminal") // "standalone_terminal" | "controller"
  ip        String
  port      Int      @default(80)          // porta ISAPI (HTTP); 8000 se precisar do SDK nativo
  username  String                          // credencial ISAPI/SDK, padrão "admin"
  password  String
  location  String?
  enabled   Boolean  @default(true)
  sdkConfig Json?    @map("sdk_config")     // detalhes específicos do papel (ex.: nº de portas físicas)
  doors     FacialAccessDoor[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("facial_access_devices")
}
```

### 4.2 Porta/portão/cancela (o que o relé abre)

Um dispositivo `standalone_terminal` sempre tem exatamente 1 porta (criada automaticamente no cadastro); um `controller` pode ter N.

```prisma
model FacialAccessDoor {
  id           String   @id @default(cuid())
  deviceId     String   @map("device_id")
  device       FacialAccessDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  doorNo       Int      @map("door_no")        // NET_DVR_ControlGateway doorNo / ISAPI door index
  name         String                           // rótulo livre, ex. "Portão Social", "Cancela Garagem"
  actuatorType String   @default("door") @map("actuator_type") // "door" | "gate" | "barrier" (porta|portão|cancela)
  direction    String?                          // "entry" | "exit" | null (ambos)
  readers      FacialAccessReader[]
  createdAt    DateTime @default(now()) @map("created_at")
  @@unique([deviceId, doorNo])
  @@map("facial_access_doors")
}
```

### 4.3 Leitor (o que captura a credencial — pode ser facial)

No caso (A) da seção 3, cada porta tem exatamente 1 leitor (o próprio terminal, `type='face'`, criado automaticamente). No caso (B), a porta de uma controladora pode ter 1 ou 2 leitores (entrada/saída), cabeados via RS-485 ou Wiegand.

```prisma
model FacialAccessReader {
  id           String   @id @default(cuid())
  doorId       String   @map("door_id")
  door         FacialAccessDoor @relation(fields: [doorId], references: [id], onDelete: Cascade)
  readerNo     Int      @map("reader_no")       // NET_DVR_ACS_ALARM_INFO.dwCardReaderNo
  type         String                            // "face" | "card" | "face_and_card"
  wiring       String   @default("rs485")        // "rs485" | "wiegand" (só relevante p/ role=controller)
  busAddress   Int?     @map("bus_address")      // endereço no barramento RS-485 (só quando wiring='rs485';
                                                   // a DS-K2812 tem 1 único barramento RS-485 compartilhado
                                                   // entre as 2 portas — o endereço, não a porta física, é
                                                   // quem identifica o leitor)
  createdAt    DateTime @default(now()) @map("created_at")
  @@unique([doorId, readerNo])
  @@map("facial_access_readers")
}
```

Confirmado no manual da DS-K2812 (`docs/CONTROLADORAS/`): **1 interface RS-485** (barramento único, compartilhado pelas 2 portas — por isso o campo `busAddress`) e **4 interfaces Wiegand** (tipicamente 2 por porta, entrada/saída — aí `readerNo` já basta, sem precisar de endereço).

### 4.4 Nível de acesso (generaliza `AccessArea` para hardware real)

Hoje `AccessArea`/`ResidentAccessArea` (`schema.prisma` linhas 554-579) já existem como rótulo puro (nome/ícone/ordem), sem vínculo a nenhuma porta. Proposta: **manter `AccessArea` como está** (continua útil como rótulo de amenidade/área) e adicionar uma tabela de vínculo que conecta uma `AccessArea` às portas físicas que ela efetivamente libera — assim uma "Área de Acesso" vira, na prática, um verdadeiro **nível de acesso**:

```prisma
model AccessAreaDoor {
  id      String @id @default(cuid())
  areaId  String @map("area_id")
  area    AccessArea @relation(fields: [areaId], references: [id], onDelete: Cascade)
  doorId  String @map("door_id")
  door    FacialAccessDoor @relation(fields: [doorId], references: [id], onDelete: Cascade)
  @@unique([areaId, doorId])
  @@map("access_area_doors")
}
```

Isso responde diretamente ao requisito: **"nestes níveis podem ou não ser incluídas as faciais"** — uma `AccessArea` (nível) passa a ter uma lista explícita de `FacialAccessDoor` (que por sua vez pode ou não ter leitor facial, ver 4.3) que ela libera. Quem tem aquela `AccessArea` concedida (`ResidentAccessArea`, já existente) tem acesso a todas as portas vinculadas a ela.

**Generalização futura (fora do escopo desta integração, mas registrado para não esquecer):** o mesmo padrão de `AccessAreaDoor` poderia, no futuro, vincular uma `AccessArea` também a saídas do Guarita (`GuaritaDevice`/`relayOutput`), unificando de vez o conceito de nível de acesso entre MG3000 e Hikvision. Hoje o Guarita usa o mecanismo próprio `receiverBitmask` (seção 1) — não é necessário migrá-lo agora, mas a tabela `AccessAreaDoor` foi desenhada de forma que essa unificação seja possível depois sem quebrar nada.

### 4.5 Pessoa

Em `Person`, um novo campo opcional para o ID sintético exigido pelo equipamento (o `byCardNo`), no mesmo espírito de `txSerial`/`cardSerial`:

```prisma
// em model Person
facialAccessCardNo String? @map("facial_access_card_no")
```

Sem alteração em `AccessEvent` — o modelo unificado já cobre o necessário (`source`, `category`, `direction`, `photoUrl`, `metadata`).

---

## 5. Arquitetura de serviço proposta

### 5.1 Serviço de comunicação com o hardware

Novo arquivo `backend-api/src/services/FacialAccessService.ts`, seguindo o padrão HTTP/Digest de `VideoDoorbellService.ts` (reaproveitando ou extraindo `digestFetch` para um módulo compartilhado, já que dois serviços vão precisar dele).

**Responsabilidades:**

| Método | Papel |
|---|---|
| `testConnection(ip, port, user, pass)` | Ping ISAPI (ex.: `GET /ISAPI/System/deviceInfo`) — mesmo critério dos videoporteiros (200 ou 401 = online) |
| `listDoors(deviceId)` | Para `role='controller'`, consulta quantas portas/leitores o equipamento realmente tem (evita cadastro manual errado) |
| `enrollFace(deviceId, cardNo, photoBase64)` | Envia a foto do morador (`Person.photoUrl`) ao equipamento via ISAPI (endpoint a confirmar na Fase 0) |
| `deleteFace(deviceId, cardNo)` | Remove o cadastro do morador do equipamento |
| `syncAccessLevel(personId, cardNo)` | Sincroniza, para cada `FacialAccessDoor` que a pessoa tem via `AccessAreaDoor`, se aquela porta específica deve aceitar o `cardNo` — usando o mecanismo nativo de plano de acesso do equipamento (a confirmar na Fase 0, seção 2.4) em vez de o backend decidir a cada evento |
| `openDoor(deviceId, doorNo)` / `closeDoor(deviceId, doorNo)` | Aciona o relé via ISAPI (equivalente ao `NET_DVR_ControlGateway`), agora sempre com `doorNo` explícito |
| listener de eventos | A definir na Fase 0: se o equipamento suportar **push HTTP configurável** (padrão do datasheet, "alarm server"), expor um endpoint receptor (`POST /api/facial-access/events`) que o próprio equipamento chama; se só suportar **long-poll ISAPI** (`GET /ISAPI/Event/notification/alertStream`), implementar um loop de conexão persistente por dispositivo, no mesmo espírito do `GuaritaEventHub` (uma conexão por dispositivo habilitado, reconexão com backoff) |

### 5.2 Handler de evento → `AccessEvent`

Análogo ao `NiceGuaritaService.handleAccessEvent`, agora correlacionando três níveis (dispositivo → porta → leitor) em vez de só o dispositivo:

1. Correlaciona o `FacialAccessDevice` físico por IP de origem.
2. Correlaciona a `FacialAccessDoor` pelo `doorNo` do evento.
3. Correlaciona o `FacialAccessReader` pelo `readerNo` do evento (se vier — nem todo evento traz, ex. eventos de porta/alarme).
4. Busca `Person` por `facialAccessCardNo` (ou pelo ID retornado no evento).
5. **Se a decisão de acesso não tiver sido feita localmente pelo equipamento** (caso raro — normalmente controladoras/terminais Hikvision já decidem sozinhos), validar contra `AccessAreaDoor`/`ResidentAccessArea` antes de marcar como autorizado.
6. Eventos de alarme (violação, tamper, coação/duress — o equivalente facial ao que já existe hoje para o Guarita: `panic`, `clone_attempt` em `NiceGuaritaService.ts`) viram `category: 'alarm'`, mesmo tratamento que já existe.
7. Sempre termina chamando `emitEvent(...)` de `EventBusService.ts`:

```ts
{
  personName, personId, unit,
  deviceName: door.name,                 // nome da porta/portão/cancela, não do dispositivo de rede
  status: 'authorized' | 'denied',
  photoUrl: /* foto capturada no reconhecimento, se o evento trouxer */,
  direction: door.direction === 'entry' ? 'in' : door.direction === 'exit' ? 'out' : null,
  category: 'access' | 'alarm',
  source: 'facial_access',
  metadata: { cardNo, deviceId, doorId, readerId, actuatorType, deviceEventType, raw },
}
```

---

## 6. `DeviceStatusService` e UI de administração

**Correção nesta revisão:** o cadastro de dispositivos físicos (Guarita, Videoporteiro, HikCentral) **não fica no `frontend-access`** — verifiquei o código real e ele está todo em **`frontend-admin/src/pages/IntegrationsPage.tsx`**, uma única página com seções empilhadas por tipo de integração (HikCentral, "Videoporteiros IP Hikvision (ISAPI)", "Receptores Nice Guarita IP (MG3000)"), cada uma com: formulário de cadastro (estado React local por seção), botão de teste de conexão antes de salvar, `POST` para criar, listagem com ping em segundo plano por dispositivo (`_pingStatus`), `PUT` parcial para toggle de habilitado e para editar campos específicos de `sdkConfig` (ex.: `setDeviceDirection` no Guarita), `DELETE` para remover, e no caso do Guarita também descoberta por varredura de rede (`showDiscovery`/`discoverSubnet`) e importação de moradores da memória do dispositivo. O `frontend-access` só tem a página "Status dos Dispositivos" (`DeviceStatusPage.tsx`), somente leitura, agregando o status de tudo.

Da mesma forma, a tela de `AccessArea` (CRUD de nome/ícone/ordem) está em **`frontend-admin/src/pages/AccessAreasPage.tsx`** — não em `frontend-access`. A atribuição de áreas a um morador específico (checkbox `access_levels`) é que fica em `frontend-access/src/pages/ResidentsPage.tsx`, por ser parte do cadastro do morador.

**Backend:** adicionar `getFacialAccessDevices()` em `DeviceStatusService.ts`, seguindo exatamente o padrão de `getLocalDevices()` (consulta `facialAccessDevice` habilitados, `testConnection` em paralelo, mapeia para `DeviceStatusEntry` com `type: 'Controladora Facial'` ou `'Leitor Facial'` conforme `role`), incluído no `Promise.all` de `getAll()`.

**Frontend (`frontend-admin`):**
- Nova seção "Leitores/Controladoras Faciais (Hikvision)" dentro de `IntegrationsPage.tsx`, seguindo exatamente o mesmo padrão de código das seções de Guarita/Videoporteiro já existentes no arquivo (estado local, teste de conexão, ping em background, CRUD via `POST`/`PUT`/`DELETE`) — cadastro do dispositivo (papel standalone/controladora, IP/porta/credenciais/localização), listagem/edição das portas (nome, tipo porta/portão/cancela, direção) e leitores associados.
- **Gestão de níveis de acesso**: evoluir `AccessAreasPage.tsx` para também permitir escolher, por área, quais `FacialAccessDoor` (e no futuro `GuaritaDevice`) aquele nível libera — via `AccessAreaDoor`. A atribuição por morador em `ResidentsPage.tsx` (frontend-access) não muda — continua sendo só a lista de áreas.
- Status online/offline integrado à página "Status dos Dispositivos" (`frontend-access`) já existente (Fase 4).

---

## 7. Riscos e desconhecidos

Itens que só serão resolvidos com o equipamento físico em mãos (ou documentação adicional do fabricante):

1. **Endpoint exato de cadastro de face via ISAPI** — caminho, método, formato do payload (multipart? base64 em XML/JSON?), limite de tamanho de foto.
2. **Mecanismo de push de eventos** — se o equipamento permite configurar uma URL de "alarm server" (como os SenseFace/ADMS de outras marcas) ou se só oferece long-poll `alertStream`. Isso decide se a arquitetura é *o equipamento chama o OnliAcesso* ou *o OnliAcesso mantém conexão aberta com o equipamento*.
3. **Autenticação** — se o Digest MD5 usado nos videoporteiros funciona igual aqui, ou se o equipamento exige HTTPS/certificado para as rotas de face (comum em terminais mais novos por exigência de biometria/LGPD).
4. **Payload do evento** — se o evento HTTP/ISAPI inclui a foto capturada no reconhecimento (como o SDK nativo inclui via `pPicData`) ou só o resultado (concedido/negado + ID).
5. **Endereçamento dos leitores RS-485 na DS-K2812** — o datasheet confirma 1 barramento único (não um por porta), mas não detalha o protocolo de endereçamento dos leitores nesse barramento (quantos endereços possíveis, se é um protocolo Hikvision proprietário ou compatível com OSDP) — só o SDK/ISAPI real ou teste físico vai esclarecer.
6. **Aplicação do nível de acesso: local (no equipamento) vs. central (no backend)** — Hikvision normalmente deixa a controladora decidir localmente (mais rápido, funciona sem rede, e o datasheet da DS-K2812 confirma "supports offline operation"); nesse caso o papel do backend é *sincronizar* a configuração de acesso para o equipamento (como o Guarita já faz com `receiverBitmask` no cadastro), não decidir em tempo real. Confirmar isso na Fase 0 evita desenhar uma validação central desnecessária.
7. **Necessidade real do SDK nativo** — só decidir depois de tentar o ISAPI na prática (Fase 0).
8. **Compatibilidade de leitor facial com a DS-K2812** — o datasheet dela não lista nenhum modelo de leitor facial compatível (não menciona a família DS-K1T673 nem outros leitores faciais Hikvision específicos para RS-485) — precisa confirmar com o fabricante/distribuidor se o DS-K1T673 pode operar em "modo leitor" conectado à controladora, ou se é necessário um leitor facial dedicado diferente (ex.: linha DS-K1F).

---

## 8. Alternativas de mercado (nota breve)

Caso o caminho Hikvision (ISAPI ou SDK nativo) se mostre inviável na prática, duas alternativas de hardware compatíveis com a filosofia standalone do projeto (reconhecimento local no equipamento, sem exigir nuvem do fabricante), ambas também com linhas de controladora + leitor RS-485/Wiegand equivalentes à DS-K2812:

- **Control iD (iDFace)** — marca brasileira, API REST/HTTP local bem documentada, modo "Standalone" nativo, push de eventos por HTTP POST para um servidor configurável, com fallback automático para reconhecimento local se o servidor cair.
- **ZKTeco (linha Push/ADMS, ex. SenseFace)** — protocolo "iClock"/ADMS: o equipamento faz POST HTTP para uma URL configurada a cada evento; reconhecimento sempre local no terminal (funciona offline).

Ambas seguem o mesmo padrão arquitetural recomendado neste documento (evento chega por HTTP, sem SDK nativo), o que tornaria a migração de hardware relativamente barata caso necessário.

---

## 9. Fases de implementação propostas

| Fase | Escopo | Status |
|---|---|---|
| **0** | Equipamento(s) na rede: teste bruto de conectividade (ping, `deviceInfo` via ISAPI) para terminal e/ou controladora, leitura da documentação ISAPI do fabricante (a obter, inclusive datasheet da DS-K2812), confirmação/ajuste dos endpoints e da topologia assumidos neste documento (item 7.6 em especial — decisão local vs. central). | **Validado em 2026-07-11** contra um DS-K1T673DX-BR real (fw V3.18.0, 172.20.120.45). Digest MD5 sobre HTTP puro funciona (sem exigência de HTTPS). Endpoints confirmados na prática: `UserInfo` Record/SetUp/Search/Delete (JSON), `FDLib/FaceDataRecord` (multipart JSON+jpg; foto sem rosto nítido → `SubpicAnalysisModelingError`; face é substituída via `FDSearch/Delete` antes do reenvio), `AcsEvent` (histórico paginado, 30/página), `RemoteControl/door/{n}` (open/close/alwaysOpen/alwaysClose) e `alertStream` (long-poll multipart — **as partes vêm em JSON** `AccessControllerEvent`, não XML; ao conectar o equipamento reenvia os últimos eventos armazenados). Decisão local confirmada: o terminal decide sozinho pelo `doorRight`/`RightPlan` gravados no cadastro — papel do backend é sincronizar, como previsto no item 7.6. Snapshot da câmera do terminal disponível em `/ISAPI/Streaming/channels/101/picture`. |
| **1** | Modelo de dados: `FacialAccessDevice`/`FacialAccessDoor`/`FacialAccessReader`/`AccessAreaDoor` + migração. CRUD do dispositivo no Admin (papel standalone/controladora) + status online/offline (`DeviceStatusService`). | **Implementado em 2026-07-07** — models Prisma, migration aplicada, `FacialAccessService.ts`, rotas `facial-access.routes.ts`, `DeviceStatusService.getFacialAccessDevices()`, seção completa em `frontend-admin/IntegrationsPage.tsx` (dispositivo + portas + leitores). CRUD e cascata de exclusão testados via API ponta a ponta. `enrollFace`/eventos em tempo real ficam para as Fases 3/4, quando os endpoints ISAPI reais forem confirmados. |
| **2** | Gestão de níveis de acesso: UI para vincular `AccessArea` a `FacialAccessDoor` (`AccessAreaDoor`), reaproveitando a tela de `AccessArea` já existente. | **Implementado em 2026-07-07** — rotas `GET`/`PUT /api/access-areas/:id/doors` e painel "🚪 Portas vinculadas" em `frontend-admin/AccessAreasPage.tsx` (checkbox por porta, agrupado por dispositivo). Testado via API: vincular, consultar, desvincular, e cascata (excluir a porta remove o vínculo automaticamente). |
| **3** | Cadastro de face de morador (`enrollFace`) — ligado ao formulário de moradores, como hoje acontece com `txSerial`/`cardSerial` para o Guarita — e sincronização do nível de acesso (`syncAccessLevel`) para o equipamento. | **Implementado e testado em 2026-07-11** contra o equipamento real. `FacialAccessService`: `syncPersonToDevice` (upsert `UserInfo/SetUp` com `doorRight`/`RightPlan` derivados de `ResidentAccessArea`→`AccessAreaDoor`, + `enrollFace` multipart com a foto de `Person.photoUrl`; remove do equipamento quem perdeu todas as portas), `syncPersonEverywhere`, `syncAllToDevice`, `ensureCardNo` (employeeNo sequencial a partir de 100 em `Person.facialAccessCardNo`), `controlDoor`. Syncs da mesma pessoa/equipamento são serializados (corrida do delete-então-envia da face duplicava a face). Hooks best-effort: PATCH/DELETE de morador (`index.ts`), PUT áreas do morador e PUT portas da área (`access-areas.routes.ts`). Rotas novas: `POST /devices/:id/sync-persons`, `POST /persons/:personId/sync`, `POST /doors/:doorId/control`. UI: botão "Sincronizar moradores" no painel do dispositivo em `IntegrationsPage.tsx`. |
| **4** | Recepção de eventos de reconhecimento em tempo real → `AccessEvent` via `emitEvent`, incluindo eventos de alarme (violação/tamper/coação). | **Implementado e testado em 2026-07-11** ao vivo. `FacialAccessEventWatcher` (novo): um long-poll `alertStream` por dispositivo habilitado, reconciliado a cada 60s (mesmo padrão do `MotionWatcher` do VMS), parser multipart **JSON**. Eventos major 5 com minor curado (1 cartão, 38/39 digital, 75/76 face) e major 1 (alarme) viram `AccessEvent` via `emitEvent` (`source: 'facial_access'`, porta correlacionada por `doorNo`, morador por `facialAccessCardNo`); majors 2/3 (exceção/operação) são ignorados. Dedup por id determinístico `facial-{deviceId}-{serialNo}` (replays na reconexão e re-imports não duplicam). Iniciado em `server.ts`. |
| **5** | UI de gestão no `frontend-access` (cadastro completo de dispositivo/portas/leitores, teste, status). | **Implementado em 2026-07-07** — a página "Status dos Dispositivos" (`DeviceStatusPage.tsx`) já era 100% genérica (renderiza `name`/`status`/`ip`/`type` de qualquer fonte), então os dispositivos faciais passaram a aparecer automaticamente assim que a Fase 1 estendeu o `DeviceStatusService`. Só corrigi uma mensagem de estado vazio desatualizada, que citava só HikCentral. Cadastro completo (dispositivo/portas/leitores) já foi resolvido na Fase 1, dentro do `frontend-admin` — decisão de arquitetura registrada na seção 6. |
| **6** | Importação de histórico de eventos do equipamento, no mesmo espírito de `NiceGuaritaService.startImportStoredEvents` (import job em segundo plano, idempotente). | **Implementado e testado em 2026-07-11**. `FacialAccessService.startImportEvents`: varre `POST /ISAPI/AccessControl/AcsEvent?format=json` paginado (30/página, `searchResultPosition`), mesmo mapeamento curado da Fase 4, `createMany` com `skipDuplicates` (ids compartilhados com o watcher — teste real: 282 eventos lidos, só os 5 ainda não capturados ao vivo foram inseridos). Rotas `POST`/`GET /devices/:id/import-events`; botão "Importar histórico de eventos" em `IntegrationsPage.tsx`. |

### ✅ Decisão superada (2026-07-11): o equipamento chegou antes

A dúvida de 2026-07-07 (implementar Fases 3/4/6 "às cegas" ou esperar o hardware) ficou sem efeito: em 2026-07-11 um **DS-K1T673DX-BR real** ficou disponível na rede (172.20.120.45) e as Fases 0, 3, 4 e 6 foram implementadas e testadas **contra o equipamento físico** na mesma sessão — ciclo completo: registrar dispositivo → criar área e vincular porta → criar morador com foto → sync (pessoa + face aceitas pelo terminal, verificado via `UserInfo/Search`) → eventos ao vivo caindo no feed via `alertStream` → importação de histórico idempotente → exclusão do morador removendo o cadastro do terminal.

**Pendências que continuam reais:**
- **Topologia B (controladora DS-K2812 + leitor satélite)** — ainda sem hardware; todo o código trata `doorNo`/`readerNo` genericamente, mas nada foi testado com uma controladora real.
- **Acionamento físico do relé** (`RemoteControl/door`) — endpoint validado só na superfície (capabilities); o comando `open` não foi disparado porque não se sabia o que estava fisicamente ligado ao relé do terminal em comissionamento.
- **Foto capturada no reconhecimento** (`pictureURL` do evento) — o terminal testado não retornou `pictureURL` nos eventos (possivelmente exige storage/config); o campo é guardado em `metadata` quando vier.
- **Deploy**: a instalação de produção (serviços Windows `onliacesso-*`) roda build anterior às Fases 1–6 — nada disso está no ar até atualizar a instalação.

### Nota sobre a Fase 1 (implementada)

- **Schema:** `backend-api/prisma/schema.prisma` — models `FacialAccessDevice`, `FacialAccessDoor`, `FacialAccessReader`, `AccessAreaDoor`, campo `Person.facialAccessCardNo`. Migration em `backend-api/prisma/migrations/20260707220000_add_facial_access_devices/`.
- **Backend:** `backend-api/src/services/FacialAccessService.ts` (testConnection via ISAPI/Digest, mesmo padrão de `VideoDoorbellService`) e `backend-api/src/routes/facial-access.routes.ts` (CRUD de devices/doors/readers), montada em `/api/facial-access`.
- **Status agregado:** `DeviceStatusService.getFacialAccessDevices()` incluído no `getAll()`.
- **UI:** seção "Leitores e Controladoras Faciais (Hikvision)" em `frontend-admin/src/pages/IntegrationsPage.tsx`, seguindo exatamente o padrão visual/funcional das seções de Guarita/Videoporteiro já existentes (form de cadastro, teste de conectividade, ping em background, toggle de habilitado, e um painel expansível por dispositivo para gerenciar portas e leitores).
- **Validação:** ciclo completo testado via API contra o banco da instalação real (criar terminal standalone com porta automática, criar controladora, adicionar porta + leitor RS-485, checar índice único de leitor duplicado, ping/test-connection, toggle, exclusão em cascata) — todos os dados de teste foram removidos ao final. Build de produção do `frontend-admin` validado sem erros. Não foi possível testar clique-a-clique num navegador real (sem ferramenta de automação de navegador disponível nesta sessão).
- **Não implementado ainda (de propósito):** `enrollFace` (envio de foto ao equipamento) e o listener de eventos em tempo real — dependem dos endpoints ISAPI reais, ainda não confirmados (ver seção 7).
