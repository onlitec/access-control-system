# OnliAcesso — Cloud Multi-Tenant e Estratégia de Releases

> Documento de referência da arquitetura implantada em 2026-07-12.
> Cobre: acesso remoto às câmeras multi-cliente (cloud.onlitec.com.br), o
> onboarding auto-aprovado de tenants, o modelo de segurança e a estratégia de
> distribuição/atualização do sistema para Windows e Linux.

---

## 1. Visão geral

O OnliAcesso é um sistema de controle de acesso condominial **standalone**:
cada cliente tem uma instalação completa e independente (backend + PostgreSQL +
painéis + VMS) rodando **na rede local dele**, em Windows ou Linux. Duas peças
centrais são compartilhadas entre todos os clientes:

- **cloud.onlitec.com.br** (VPS Hetzner) — acesso remoto às câmeras de todos os
  clientes (multi-tenant) + distribuição de instaladores/atualizações.
- **Tailnet Onlitec** (Tailscale) — VPN privada que liga cada servidor de
  cliente ao VPS. Nada de nenhum cliente fica exposto à internet.

```
                      Internet (HTTPS)
                            │
        ┌───────────────────▼────────────────────┐
        │      VPS cloud.onlitec.com.br          │
        │  Nginx Proxy Manager (proxy host 14)   │
        │  ├─ /              PWA Onlitec Cloud   │
        │  ├─ /t/{slug}/...  roteamento p/ tenant│
        │  ├─ /downloads/    instaladores + manif│
        │  ├─ tenant-registry (só tailnet, :8787)│
        │  └─ coturn (TURN 3478/udp, WebRTC)     │
        └───────────┬───────────────┬────────────┘
                    │  Tailscale    │  Tailscale
        ┌───────────▼─────┐   ┌─────▼───────────┐
        │ Cliente onlitec │   │ Cliente galvatec│   … 1 por cliente
        │ (Linux/systemd) │   │ (Windows/WinSW) │
        │ api :3001       │   │ api :3001       │
        │ HLS :8888       │   │ HLS :8888       │
        │ WHEP :8889      │   │ WHEP :8889      │
        └───────┬─────────┘   └───────┬─────────┘
                ▼ LAN                 ▼ LAN
          câmeras/DVRs/leitores  câmeras/DVRs/leitores
```

---

## 2. Cloud multi-tenant (câmeras remotas)

### 2.1 Como funciona

- A PWA (**Onlitec Cloud**, `frontend-cloud/`, container no VPS porta 3050) é a
  interface única para todos os clientes. No login ela pede o **Código do
  cliente** (slug), e-mail e senha.
- Todas as requisições ganham o prefixo do tenant:
  `https://cloud.onlitec.com.br/t/{slug}/api|hls|webrtc/...`
- No VPS, um `map` do nginx converte `slug → IP Tailscale` do servidor daquele
  cliente e o proxy encaminha para as portas 3001 (API), 8888 (HLS) ou 8889
  (WebRTC/WHEP). Slug desconhecido morre no VPS com **404**.
- **A autenticação é do próprio cliente**: `POST /t/{slug}/api/auth/login`
  chega ao backend local dele, que valida contra os usuários do painel local.
  O VPS **não tem banco de usuários**.

### 2.2 Onde cada coisa vive

| Peça | Local |
|---|---|
| Registry de tenants (`slug IP;`) | `{npm_data}/nginx/custom/onliacesso-tenants.map` no VPS |
| Map nginx (`$onli_tenant → $onli_tenant_host`) | `{npm_data}/nginx/custom/http_top.conf` (template: `deploy/cloud/npm-http-top.conf`) |
| Locations `/t/{slug}/…` | Advanced do proxy host 14 do NPM (template: `deploy/cloud/nginx-proxy-manager.conf`; persistido também no `database.sqlite` do NPM) |
| PWA | `/home/alfreire/docker/apps/onlitec-pwa` (deploy: `deploy/cloud/deploy-pwa.sh`) |
| Serviço de registro | systemd `onliacesso-registry` → `/opt/onliacesso-registry/server.js` (fonte: `deploy/cloud/tenant-registry/`) |

`{npm_data}` = `/var/lib/docker/volumes/npm_data/_data`. Acesso ao VPS:
`ssh -p 4450 alfreire@10.10.10.1` (interno) ou `65.109.14.53` (público).

### 2.3 Fluxo de cadastro de um tenant (auto-approve)

**Caminho normal — botão no painel do cliente:**

1. Admin do cliente abre **Admin → Configurações → Acesso via nuvem**.
2. Informa o código desejado (ex.: `marcia`) e, se o Tailscale ainda não estiver
   conectado, a **chave de ativação** (`tskey-auth-…`) fornecida pela Onlitec.
3. Clica **Habilitar**. O backend (`/api/cloud/enable`) executa em sequência:
   - `tailscale up` (se necessário) e obtém o IP `100.x` da máquina;
   - firewall: libera 3001/8888/8889 **só para o IP do VPS** (ufw no Linux,
     Windows Firewall no Windows);
   - chama `POST http://100.90.27.7:8787/register {slug}` pela tailnet;
   - grava o bloco TURN (`webrtcICEServers2`) devolvido pelo registry no
     `mediamtx.yml` e reinicia o MediaMTX;
   - salva o estado em `IntegrationConfig` (providerType `cloud`).
4. O card mostra o link `https://cloud.onlitec.com.br/?t=marcia` (o `?t=`
   pré-preenche o código no app — serve para link/QR de divulgação).
5. **Desabilitar** chama `/unregister` e derruba o `/t/{slug}/` na hora.

**Por que auto-approve é seguro:** a identidade do cliente no registry é o
**IP Tailscale de origem da conexão** — não-forjável dentro da tailnet — e
entrar na tailnet exige uma chave que só a Onlitec emite. Ou seja, a
autorização acontece no momento em que você entrega a chave de ativação.

**Proteções do registry:** slug já usado por OUTRO IP → 409 (anti-sequestro);
um servidor = um slug; slugs reservados (`api, hls, webrtc, t, admin, login,
assets`) recusados; qualquer chamada de fora da tailnet → 403; toda escrita no
map passa por `nginx -t` com rollback automático antes do reload.

**Caminho manual/socorro (do PC do dev):**
`bash deploy/cloud/add-tenant.sh <slug> <nome-magicdns-ou-ip>` — mesmo efeito,
com resolução MagicDNS→IP feita no host do VPS. Use-o quando o cliente
**reinstalar o servidor** (nó novo na tailnet = IP novo; o slug fica preso ao
IP antigo de propósito, então o re-aponte é manual).

### 2.4 Fluxo de acesso do usuário final

1. Abre `cloud.onlitec.com.br` (site ou PWA instalada). Digita código do
   cliente (fica salvo no aparelho), e-mail e senha **do painel local dele**.
2. O login retorna o JWT emitido pelo backend do próprio cliente (access 1 dia,
   refresh 7 dias — renovação automática, senha só é redigitada após uma semana
   sem uso).
3. Vídeo ao vivo: WebRTC/WHEP (<1s de latência; mídia via TURN no VPS quando o
   NAT não permite direto) com fallback automático para HLS (~2s). Toda
   requisição de vídeo leva `?jwt=` validado pelo `stream-auth` do cliente.
4. Reprodução de gravações, download de trechos e REC manual seguem o mesmo
   caminho autenticado.

### 2.5 Modelo de isolamento (3 camadas independentes)

1. **Roteamento** — o slug decide o destino; slug inexistente = 404 no VPS.
2. **Criptografia** — cada instalação gera um `JWT_SECRET` aleatório no
   install. Token do cliente A contra rotas do cliente B **falha na
   assinatura** (validado na prática: 401 na API e num stream HLS real).
   O mesmo e-mail pode existir em dois tenants sem conflito — são contas
   independentes.
3. **Rede** — o servidor do cliente só aceita 3001/8888/8889 vindos do IP
   Tailscale do VPS; nada exposto à internet.

**Regra permanente:** a API de controle do MediaMTX (porta **9997**) NUNCA é
exposta — `/v3/config/paths/list` devolve URLs RTSP **com as senhas das
câmeras**. Ela vive em 127.0.0.1; a listagem de câmeras da PWA vem de
`GET /api/vms/devices`, que nunca retorna senha.

---

## 3. Distribuição e releases (Windows + Linux)

### 3.1 Estratégia

**Um repositório privado** (`onlitec/access-control-system`), **uma versão**
(`package.json` raiz), **uma tag `vX.Y.Z`** → a CI produz **dois artefatos** e
o manifesto, publicados em `https://cloud.onlitec.com.br/downloads/`:

| Artefato | SO | Conteúdo |
|---|---|---|
| `OnliAcessoSetup-<v>.exe` (~300 MB) | Windows 10/11, Server 2019+ x64 | Inno Setup com TUDO embutido: Node 20.20.2, PostgreSQL 16, nginx 1.26.3, ffmpeg (série n7.1 pinada), WinSW, MediaMTX 1.9.3, rclone |
| `onliacesso-linux-<v>.tar.gz` (~9 MB) | Debian/Ubuntu | Apps compilados + `install.sh`; dependências instaladas no destino (NodeSource, apt) |
| `latest.json` | — | Manifesto multi-OS para o update-check |

### 3.2 Compatibilidade Linux

O instalador exige `apt` + systemd + empacotamento Debian do PostgreSQL
(recusa outras famílias explicitamente):

| Distro | Status |
|---|---|
| Ubuntu 22.04 LTS | **Suportada — testada em produção** (PG 14) |
| Ubuntu 24.04 LTS | Suportada (PG 16) |
| Debian 12 | Suportada (PG 15) |
| Debian 11 | Deve funcionar; não testada |
| RHEL/Fedora/Alpine/Arch | **Não suportadas** |

Arquitetura: amd64; arm64 deve funcionar (não testada).

### 3.3 Como sai uma release

```bash
# 1. versão única
npm version 2.3.0 --no-git-tag-version && git commit -am "chore: v2.3.0"
# 2. tag anotada (a mensagem vira as notas do latest.json)
git tag -a v2.3.0 -m "Notas da versão" && git push && git push --tags
# 3. CI (.github/workflows/release.yml) faz o resto
```

O workflow: job **ubuntu** builda os 4 apps e gera o tar.gz; job **windows**
builda, baixa os binários pinados (`download-binaries.sh`, SHA256 verificado) e
compila o .exe com Inno Setup (choco); job **publish** valida os SHA256, faz
upload **atômico** para o VPS (sobe `.tmp`, confere hash no destino, renomeia,
`latest.json` por último) e roda smoke test público. A CI **falha cedo** se a
tag não bater com a versão do `package.json`.

Secrets do repo (já configurados): `VPS_SSH_KEY` (chave dedicada do CI,
pública no authorized_keys do VPS), `VPS_HOST=65.109.14.53`, `VPS_PORT=4450`,
`SMTP_DEFAULTS_ENV` (opcional).

### 3.4 Formato do latest.json

```json
{
  "version": "2.2.0",
  "notes": "texto das notas (mensagem da tag)",
  "windows": { "url": ".../OnliAcessoSetup-2.2.0.exe", "sha256": "..." },
  "linux":   { "url": ".../onliacesso-linux-2.2.0.tar.gz", "sha256": "..." }
}
```

### 3.5 Atualizações no cliente

- Os dois instaladores gravam `UPDATE_MANIFEST_URL=https://cloud.onlitec.com.br/downloads/latest.json`
  no `.env`.
- **Admin → Configurações → Atualizações → Verificar agora** compara a versão
  instalada com o manifesto e oferece o link do instalador **do SO certo**
  (`/api/ops/update-check` escolhe `windows`/`linux` por `process.platform`).
- A aplicação é manual: rodar o instalador novo por cima. Banco, `.env` e
  gravações são preservados nos dois SOs.

### 3.6 Instalação na casa do cliente (sem acesso ao repo)

- **Windows:** baixar o `.exe` de `/downloads/`, conferir o `.sha256`, executar
  como Administrador.
- **Linux:** `sudo ./bootstrap.sh --from-release` — baixa o tar.gz de
  `/downloads/`, **confere o SHA256 contra o latest.json** e instala. Nenhuma
  credencial de GitHub é necessária. (O modo antigo, que clona o repo privado,
  continua existindo para desenvolvimento.)

Detalhes completos de instalação: `docs/INSTALL.md`.

---

## 4. Operação e troubleshooting

| Preciso de… | Comando/lugar |
|---|---|
| Listar tenants | `bash deploy/cloud/add-tenant.sh --list` |
| Cadastrar/re-apontar tenant manualmente | `bash deploy/cloud/add-tenant.sh <slug> <magicdns\|ip>` |
| Logs do registry | `ssh VPS` → `journalctl -u onliacesso-registry` |
| Testar roteamento de um tenant | `curl -X POST https://cloud.onlitec.com.br/t/<slug>/api/auth/login -d '{}' -H 'Content-Type: application/json'` → 400/401/500 = roteou; 404 = slug não existe; 502 = VPS não alcança o servidor |
| Testar isolamento | token do tenant A em `/t/B/api/vms/devices` deve dar **401** |
| Ver o que está publicado | `curl https://cloud.onlitec.com.br/downloads/latest.json` |
| Republicar a PWA | `bash deploy/cloud/deploy-pwa.sh` |

**Pegadinhas conhecidas (custaram debug real):**

- Regex de `location` do nginx com `{2,32}` precisa estar **entre aspas** —
  sem elas o `{` é lido como abertura de bloco.
- O `map` do nginx e as locations que criam a variável capturada precisam ser
  aplicados **juntos** (um sem o outro derruba o `nginx -t` de TODOS os hosts
  do NPM).
- MagicDNS **não resolve dentro do container do NPM** — por isso o registry
  guarda IPs; a resolução nome→IP acontece no host do VPS (`tailscale ip -4`).
- Advanced config do host 14 vive no `database.sqlite` do NPM — editar só o
  `14.conf` gerado funciona até alguém salvar no painel; persistir nos dois.
- Em comandos SSH, `sudo -S`, `grep -f /dev/stdin` e afins **consomem o stdin**
  e silenciosamente ignoram o conteúdo que você pipeou — enviar para /tmp
  primeiro e usar `sudo sh -c 'cat /tmp/x >> destino'`.
- Sem `webrtcICEServers2` no `mediamtx.yml` do cliente, o vídeo remoto cai para
  HLS **silenciosamente** (o MediaMTX só anuncia o TURN nos headers `Link` do
  WHEP se o bloco existir). O botão do painel já configura isso sozinho.

**Datas/pendências:**

- Locations legadas sem prefixo (`/api/`, `/hls/`, `/webrtc/` → galvatec) devem
  ser removidas do host 14 após **2026-07-26** (transição de PWAs antigas).
- O pipeline de release ainda não rodou de ponta a ponta — estreia na primeira
  tag real (ex.: `v2.3.0`); acompanhar os 3 jobs no Actions.
- A instalação Windows (galvatec) roda backend anterior a `/api/cloud` — o card
  "Acesso via nuvem" passa a valer lá na próxima atualização do sistema.

## 5. Mapa de arquivos

| Área | Arquivos |
|---|---|
| PWA cloud | `frontend-cloud/src/{tenant.js,auth.js,App.jsx,components/VideoPlayer.jsx,views/*}` |
| Roteamento VPS | `deploy/cloud/{nginx-proxy-manager.conf,npm-http-top.conf,onliacesso-tenants.map.example}` |
| Registro de tenants | `deploy/cloud/tenant-registry/{server.js,onliacesso-registry.service}`, `deploy/cloud/add-tenant.sh` |
| Botão do painel | `backend-api/src/routes/cloud.routes.ts`, `frontend-admin/src/pages/SystemSettingsPage.tsx` |
| Update-check | `backend-api/src/routes/ops.routes.ts` |
| CI de release | `.github/workflows/release.yml` |
| Instaladores | `installer/windows/*`, `installer/linux/*` (bootstrap `--from-release`) |
| Docs | `docs/INSTALL.md`, `deploy/cloud/README.md`, este arquivo |
