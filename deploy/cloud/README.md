# Cloud Bridge — acesso remoto às câmeras (MULTI-TENANT)

Publica o VMS de **N clientes** do OnliAcesso na internet, em
`cloud.onlitec.com.br`, sem expor nenhum servidor local. Cada cliente tem um
**código (slug)** e loga com os usuários do próprio OnliAcesso dele — e só
enxerga as próprias câmeras.

```
  Celular / PC (internet)
          │  HTTPS  /t/{slug}/api|hls|webrtc/...
          ▼
  ┌──────────────────────────────┐
  │  VPS (Hetzner, Helsinki)     │
  │  · Nginx Proxy Manager       │  proxy host 14 + map slug→IP (custom/)
  │  · frontend-cloud (PWA:3050) │  ← este repositório
  │  · coturn (TURN 3478/udp)    │  relay do vídeo WebRTC
  └──────────────┬───────────────┘
                 │  Tailscale (VPN privada)
     ┌───────────┴──────────────┐
     ▼                          ▼
  ┌────────────────────┐   ┌────────────────────┐
  │ Cliente "onlitec"  │   │ Cliente "galvatec" │   … (um por cliente)
  │ Linux onli-acesso  │   │ Win desktop-b3mtp33│
  │ 100.107.189.31     │   │ 100.77.220.32      │
  │ api:3001 hls:8888  │   │ api:3001 hls:8888  │
  │ webrtc:8889        │   │ webrtc:8889        │
  └─────────┬──────────┘   └─────────┬──────────┘
            ▼ LAN                    ▼ LAN
      Câmeras IP / NVR         Câmeras IP / NVR
```

## Como o multi-tenant funciona

- A PWA pede o **código do cliente** no login e prefixa todas as URLs com
  `/t/{slug}` (helper `frontend-cloud/src/tenant.js`).
- No VPS, um `map` do nginx (`custom/http_top.conf` → registry
  `custom/onliacesso-tenants.map`) converte o slug no IP Tailscale do servidor
  daquele cliente. Slug desconhecido → 404.
- **A autenticação é do próprio cliente**: o login vai para o backend local
  dele (`/t/{slug}/api/auth/login`). O VPS não guarda usuários.
- **Isolamento**: cada instalação do OnliAcesso gera um `JWT_SECRET` aleatório
  no install. O token do cliente A não vale no backend nem no stream-auth do
  cliente B — testado (retorna 401).

## Onboarding de um cliente novo (Windows ou Linux)

### Caminho normal: o botão do painel (auto-approve)

No painel Admin do cliente → **Configurações → Acesso via nuvem**: informar o
código do cliente e clicar **Habilitar**. O backend faz tudo sozinho:
conecta/verifica o Tailscale (aceita a "chave de ativação" `tskey-auth-…` que
a Onlitec fornece, na primeira vez), aplica o firewall, registra o tenant no
`tenant-registry` do VPS e grava o TURN no `mediamtx.yml`. Em segundos o card
mostra o link pronto.

O registro é **auto-aprovado** porque a identidade do cliente é o IP Tailscale
de origem da chamada (não-forjável dentro da tailnet) — e entrar na tailnet já
exige uma chave que só a Onlitec emite. O registry recusa slug de outro
cliente (409), slugs reservados e chamadas de fora da tailnet.

Backend: `backend-api/src/routes/cloud.routes.ts` (`/api/cloud/status|enable|disable`).
Serviço no VPS: `tenant-registry/` (systemd `onliacesso-registry`, escuta só em
`100.90.27.7:8787`).

### Caminho manual / socorro (do PC do dev)

1. **Tailscale** na máquina do cliente: `tailscale up`, anotar o nome MagicDNS.
2. **Firewall**: `enable-cloud-access.ps1 -VpsTailscaleIp 100.90.27.7` (Win) ou
   `sudo enable-cloud-access.sh 100.90.27.7` (Linux).
3. **TURN**: repor o segredo do coturn em `webrtcICEServers2` no `mediamtx.yml`.
4. **Registrar**:
   ```bash
   bash deploy/cloud/add-tenant.sh <slug> <nome-magicdns-ou-ip100.x>
   bash deploy/cloud/add-tenant.sh --list   # conferir
   ```
5. Entregar: `https://cloud.onlitec.com.br/?t=<slug>` (pré-preenche o código).

**Cliente reinstalou o servidor?** O IP 100.x muda junto com o nó novo. O
botão do painel resolve sozinho se o slug ficou órfão? Não — o slug antigo
fica preso ao IP antigo; re-aponte manualmente com
`add-tenant.sh <slug> <nome-magicdns>` (proteção anti-sequestro proposital).

## Regras que não podem ser quebradas

**Nunca expor a API de controle do MediaMTX (porta 9997).** O endpoint
`/v3/config/paths/list` devolve as URLs RTSP **com as senhas das câmeras**, e a
API permite criar/apagar streams. Ela fica em `127.0.0.1` no servidor local; a
listagem de câmeras do app vem de `GET /api/vms/devices` (backend), que nunca
retorna senha. As locations do multi-tenant só falam com 3001/8888/8889.

**Todo acesso ao vídeo é autenticado.** O MediaMTX de cada cliente valida cada
requisição em `POST /api/vms/stream-auth` (JWT na query `?jwt=`). Só tokens de
usuário do sistema passam — tokens de morador e de onboarding são recusados.

**Cuidado com `custom/http_top.conf`**: um erro de sintaxe nele derruba o
`nginx -t` de **todos** os proxy hosts do NPM. Nunca editar o registry à mão —
use o `add-tenant.sh` (testa antes e faz rollback).

Nota: o token aparece na query (`?jwt=`/`?token=`). As locations de HLS têm
`access_log off`; o download de gravação ainda loga a URL no NPM — aceitável
porque o token expira em 1 dia, mas não recorte logs para terceiros.

## Transporte de vídeo

- **WebRTC (WHEP)** é o caminho principal: latência abaixo de 1s. Se o NAT
  permitir, a mídia vai **direto** do servidor local ao dispositivo (ambos no
  Brasil); senão passa pelo **TURN** no VPS.
- **HLS** é o plano B automático (redes que bloqueiam UDP). Custa alguns
  segundos de atraso e o app sinaliza isso com um "HLS" no canto.
- O header `Location` do WHEP volta sem o prefixo `/t/{slug}` — hoje é
  irrelevante (o player não usa a URL da sessão), mas se um dia houver
  trickle-ICE/teardown será preciso `proxy_redirect`.

## Arquivos

| Arquivo | O que é |
|---|---|
| `nginx-proxy-manager.conf` | Locations do proxy host de `cloud.onlitec.com.br` (colar em *Advanced* no painel do NPM) — rotas `/t/{slug}/…` + legado |
| `npm-http-top.conf` | Template do `custom/http_top.conf` do NPM (map slug→IP) |
| `onliacesso-tenants.map.example` | Exemplo do registry de tenants |
| `add-tenant.sh` | Cadastra/re-aponta um tenant no VPS (com nginx -t + rollback) |
| `deploy-pwa.sh` | Publica a PWA no VPS |
| `turnserver.conf.example` | Configuração do coturn — **o segredo real não vai para o Git** |
| `../../frontend-cloud/` | Código da PWA (build via Docker, porta 3050) |

## Deploy da PWA

```bash
bash deploy/cloud/deploy-pwa.sh
```

## Downloads / Releases

`https://cloud.onlitec.com.br/downloads/` serve os instaladores e o
`latest.json` (manifesto que o Admin de cada cliente consulta em "Verificar
atualizações"). Arquivos ficam em
`/var/lib/docker/volumes/npm_data/_data/onliacesso-downloads/` no VPS e são
publicados pela CI (`.github/workflows/release.yml`) a cada tag `v*` — ver
`docs/INSTALL.md` para o fluxo de release completo.

## Legado (transição)

As locations sem prefixo (`/api/`, `/hls/`, `/webrtc/`) continuam apontando
para o servidor Windows original até **2026-07-26**, para não quebrar PWAs já
instaladas antes do multi-tenant (elas atualizam sozinhas no próximo open).
Depois disso, apagar os 3 blocos "LEGADO" do Advanced do proxy host 14.

## Segredos (fora do Git)

| Segredo | Onde vive |
|---|---|
| `static-auth-secret` do coturn | `/etc/turnserver.conf` no VPS **e** `webrtcICEServers2` do `mediamtx.yml` de cada cliente — precisam bater |
| `VMS_INTERNAL_TOKEN`, senhas de câmera | `.env` e banco de cada servidor local |
