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

1. **Tailscale** na máquina do cliente: instalar e entrar na tailnet
   (`tailscale up`). Anotar o nome MagicDNS (`tailscale status`).
2. **Firewall** no servidor do cliente — liberar 3001/8888/8889 só para o VPS:
   - Windows: `C:\OnliAcesso\scripts\enable-cloud-access.ps1 -VpsTailscaleIp 100.90.27.7`
   - Linux: `sudo /opt/onliacesso/…/enable-cloud-access.sh 100.90.27.7`
3. **TURN**: repor o segredo do coturn em `webrtcICEServers2` no `mediamtx.yml`
   do cliente (endereço do TURN é o do VPS; sem isso o app cai para HLS).
4. **Registrar o tenant** (do PC do dev):
   ```bash
   bash deploy/cloud/add-tenant.sh <slug> <nome-magicdns-ou-ip100.x>
   bash deploy/cloud/add-tenant.sh --list   # conferir
   ```
   O script resolve o nome→IP no host do VPS, atualiza o registry, roda
   `nginx -t` (com rollback automático se falhar), recarrega e faz smoke test.
5. Entregar ao cliente: `https://cloud.onlitec.com.br` + o código dele
   (ou o atalho `https://cloud.onlitec.com.br/?t=<slug>`, que pré-preenche).

**Cliente reinstalou o servidor?** O IP 100.x muda junto com o nó novo — basta
re-rodar `add-tenant.sh <slug> <nome-magicdns>` (o nome acompanha a máquina).

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
