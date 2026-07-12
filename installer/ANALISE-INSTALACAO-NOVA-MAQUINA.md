# Instalação limpa em outra máquina — análise de viabilidade (v2.2.0)

Pergunta respondida aqui: *instalando o pacote numa VM Windows nova, na mesma rede local mas com outro IP, o sistema funciona igual a esta instalação?*

**Resposta: sim, com 3 passos manuais depois do instalador** (Google Drive, acesso remoto e recadastro dos equipamentos). O resto é automático — inclusive o IP novo, que é detectado na instalação.

Pacote: `installer/dist/OnliAcessoSetup-2.2.0.exe` (286 MB)
SHA256: `8f04c2810edc3a878232db9ffe5fe971af0f3487aa70222f4bfc3d05af8964a6`

---

## 1. O que o pacote já resolve sozinho

| Item | Como é resolvido |
|---|---|
| **IP novo** | `install.ps1` detecta o IP da máquina (preferindo a LAN, deixando Tailscale/CGNAT por último) e grava em `APP_URL`. Nada no código depende de um IP fixo. |
| **Proxy/portas** | O nginx escuta em `server_name _` (qualquer host/IP) e fala com os serviços por `127.0.0.1`. Idêntico ao desta instalação (conferido byte a byte). |
| **Banco de dados** | PostgreSQL empacotado, senha aleatória por instalação, migrations aplicadas no fim (`prisma migrate deploy`). As 5 migrations recentes estão no pacote. |
| **Segredos** | `JWT_SECRET`, senha do banco e `VMS_INTERNAL_TOKEN` são gerados na hora e gravados no `.env` + `config/credenciais.txt`. |
| **Firewall** | Cria TCP 80 e — **novidade da 2.2.0** — UDP 8189 (WebRTC). |
| **Serviços Windows** | Os 8 serviços (`onliacesso-*`) são registrados via WinSW, com a ACL para NetworkService. |
| **SMTP** | `smtp-defaults.env` vai no pacote: e-mail já sai configurado. |
| **Código** | Verificado no staging: leitores faciais (fases 0–6), network discovery, gestão de dispositivos, VMS Xiongmai/Dahua, hook de gravação corrigido, cache do dashboard, captura facial assistida — tudo presente, backend e frontends. |

## 2. Os 3 passos manuais (não há como o instalador adivinhar)

### 2.1 Google Drive (obrigatório se quiser backup na nuvem)
O `rclone.conf` guarda um **token OAuth do Google** — é uma credencial pessoal, não vai no instalador. Na máquina nova:

```powershell
C:\OnliAcesso\binaries\rclone\rclone.exe config --config C:\OnliAcesso\config\rclone.conf
# n) new remote → nome: local → tipo: drive → login no navegador
```
Depois, no Admin → VMS → Armazenamento, cadastrar o destino (remote `local`, modo `copy`).
*Alternativa mais rápida: copiar o `C:\OnliAcesso\config\rclone.conf` desta máquina — o token funciona em qualquer host.*

### 2.2 Acesso remoto / cloud (só se for usar `cloud.onlitec.com.br`)
Duas coisas ficam fora do instalador:
- **Tailscale**: instalar e entrar na tailnet; depois apontar o VPS para o **novo** host.
- **STUN/TURN**: o `mediamtx.yml` desta instalação tem `webrtcICEServers2` apontando para `65.109.14.53`. O pacote traz esse bloco **comentado** (na LAN não é necessário). Para o remoto voltar a funcionar com baixa latência, descomentar e repor o segredo do TURN.
- Regras de firewall do cloud (TCP 3001/8888/8889 restritas ao Tailscale) também foram criadas à mão aqui.

### 2.3 Recadastro dos equipamentos (instalação limpa = banco vazio)
Não há moradores, usuários nem dispositivos. Recadastrar pelo Admin:
- Terminal facial `172.20.120.45` (Integrações → Leitores Faciais) e vincular a porta à área de acesso, senão o sync de faces não acontece.
- Câmeras e o HVR GS08HVR `172.20.120.46` (VMS → protocolo **Xiongmai/XMeye**; desativar os canais sem câmera, senão o DVR estoura o limite de sessões RTSP).
- Módulos Guarita — **atenção**: os cadastrados aqui apontam para `192.168.1.124`, IP de uma rede antiga, e estão offline. Usar o IP correto.
- A **varredura de rede** (Admin → Dispositivos e Servidores → Buscar na rede) encontra e identifica os equipamentos, acelerando esse passo.

## 3. Riscos e pontos de atenção na VM

| Risco | Impacto | Mitigação |
|---|---|---|
| **Porta 80 ocupada** (IIS, Skype, outro nginx) | O proxy não sobe e nada abre | Conferir antes: `Get-NetTCPConnection -LocalPort 80 -State Listen`. A porta do PostgreSQL o instalador já desvia sozinho (5432→5433). |
| **Disco** | O VMS **pausa a gravação** se o livre cair abaixo de 10 GB (`VMS_MIN_FREE_GB`) | Dimensionar o disco da VM com folga. Nesta máquina o livre está em 12,4 GB — no limite. |
| **VM sem aceleração / rede virtual** | Vídeo é o que mais pesa: cada câmera "sempre ligada" mantém RTSP aberto (~1–2 Mbps por sub-stream) | Se a rede da VM for NAT em vez de bridge, os equipamentos podem não ser alcançáveis, e a descoberta ONVIF/SADP (multicast/broadcast) **não funciona atrás de NAT** — usar rede em **bridge**. |
| **Antivírus/SmartScreen** | O instalador não é assinado — o Windows vai alertar | Aceitar o aviso ("Mais informações" → "Executar assim mesmo"). |
| **Multicast/VLAN** | ONVIF (UDP 3702) e SADP (UDP 37020) não cruzam roteador | Já é o caso aqui; o ARP scan cobre a sub-rede local. |

## 4. O que *não* impacta (verificado, para tranquilidade)

- **IP fixo em código**: não existe. Tudo é `127.0.0.1` internamente, e o IP do host só vira `APP_URL`/mensagem de boas-vindas.
- **`.env`**: as 4 chaves que existem aqui e o instalador não escreve (`RCLONE_EXE`, `VMS_HLS_BASE`, `VMS_MEDIAMTX_API`, `VMS_ALWAYS_ON`) são legadas ou têm default idêntico no código — nenhuma altera o comportamento.
- **Fotos dos moradores**: ficam no banco (data URL base64), não em disco — não há pasta de uploads para copiar.
- **`nginx.conf`**: idêntico ao empacotado.
- **Hook de gravação**: o `.bat` é regravado pelo vms-service no boot, com o token e a porta daquela máquina.

## 5. Ordem recomendada na VM

1. Rede em **bridge**, IP na mesma faixa dos equipamentos (172.20.120.x).
2. Conferir que a porta 80 está livre.
3. Executar `OnliAcessoSetup-2.2.0.exe` como Administrador, marcando o componente **Gerenciador de Imagens (VMS)**.
4. Guardar o `config/credenciais.txt` (admin inicial + senha do banco) e apagá-lo depois.
5. Configurar o rclone/Google Drive (2.1).
6. Cadastrar os equipamentos (2.3) — usar a varredura de rede.
7. Se for usar o acesso remoto: Tailscale + STUN/TURN + regras de firewall (2.2).
