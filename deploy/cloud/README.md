# Cloud Bridge — acesso remoto às câmeras

Publica o VMS (câmeras do condomínio) na internet, em `cloud.onlitec.com.br`,
sem expor o servidor local.

```
  Celular / PC (internet)
          │  HTTPS
          ▼
  ┌──────────────────────────────┐
  │  VPS (Hetzner, Helsinki)     │
  │  · Nginx Proxy Manager       │  proxy host 14
  │  · frontend-cloud (PWA:3050) │  ← este repositório
  │  · coturn (TURN 3478/udp)    │  relay do vídeo WebRTC
  └──────────────┬───────────────┘
                 │  Tailscale (VPN privada)
                 ▼
  ┌──────────────────────────────┐
  │  Servidor local (Windows)    │  100.77.220.32
  │  · backend-api      :3001    │  login + API das câmeras
  │  · MediaMTX HLS     :8888    │  vídeo (exige ?jwt=)
  │  · MediaMTX WebRTC  :8889    │  signaling
  └──────────────┬───────────────┘
                 │  LAN
                 ▼
           Câmeras IP / NVR
```

## Regras que não podem ser quebradas

**Nunca expor a API de controle do MediaMTX (porta 9997).** O endpoint
`/v3/config/paths/list` devolve as URLs RTSP **com as senhas das câmeras**, e a
API permite criar/apagar streams. Ela fica em `127.0.0.1` no servidor local; a
listagem de câmeras do app vem de `GET /api/vms/devices` (backend), que nunca
retorna senha.

**Todo acesso ao vídeo é autenticado.** O MediaMTX valida cada requisição em
`POST /api/vms/stream-auth` (JWT na query `?jwt=`). Só tokens de usuário do
sistema passam — tokens de morador e de onboarding são recusados.

**No firewall do Windows**, as portas 8888 (HLS), 8889 (signaling) e 3001 (API)
só aceitam conexões do **IP Tailscale do VPS**.

## Transporte de vídeo

- **WebRTC (WHEP)** é o caminho principal: latência abaixo de 1s. Se o NAT
  permitir, a mídia vai **direto** do servidor local ao dispositivo (ambos no
  Brasil); senão passa pelo **TURN** no VPS.
- **HLS** é o plano B automático (redes que bloqueiam UDP). Custa alguns
  segundos de atraso e o app sinaliza isso com um "HLS" no canto.

## Arquivos

| Arquivo | O que é |
|---|---|
| `nginx-proxy-manager.conf` | Locations do proxy host de `cloud.onlitec.com.br` (colar em *Advanced* no painel do NPM) |
| `turnserver.conf.example` | Configuração do coturn — **o segredo real não vai para o Git** |
| `../../frontend-cloud/` | Código da PWA (build via Docker, porta 3050) |

## Deploy da PWA

```bash
# a partir da raiz do repositório
scp -P 4450 -r frontend-cloud/* alfreire@10.10.10.1:/home/alfreire/docker/apps/onlitec-pwa/
ssh -p 4450 alfreire@10.10.10.1 'cd /home/alfreire/docker/apps/onlitec-pwa && docker compose up -d --build'
```

## Segredos (fora do Git)

| Segredo | Onde vive |
|---|---|
| `static-auth-secret` do coturn | `/etc/turnserver.conf` no VPS **e** `webrtcICEServers2` do `mediamtx.yml` no servidor local — os dois precisam bater |
| `VMS_INTERNAL_TOKEN`, senhas de câmera | `.env` e banco do servidor local |
