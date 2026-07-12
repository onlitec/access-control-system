# Manual de Instalação — OnliAcesso no Linux

Instalação nativa (sem Docker) com serviços systemd, testada em produção.

## 1. Requisitos

### Sistema operacional

| Distro | Status |
|---|---|
| **Ubuntu 22.04 LTS** (jammy) | Suportada — testada em produção (PostgreSQL 14) |
| **Ubuntu 24.04 LTS** (noble) | Suportada (PostgreSQL 16) |
| **Debian 12** (bookworm) | Suportada (PostgreSQL 15) |
| Debian 11 (bullseye) | Deve funcionar; não testada |
| RHEL / Fedora / Alpine / Arch | **Não suportadas** — o instalador exige `apt` e recusa outras famílias |

Arquitetura: **amd64** (arm64 deve funcionar; não testada).

### Hardware e rede

- **4 GB de RAM** (8 GB se for usar o VMS/câmeras), 2 vCPUs
- **20 GB de disco** + espaço para gravações de câmeras (se VMS)
- Acesso root (`sudo`)
- Porta **80** livre (nginx) — o instalador remove o site default do nginx
- Rede local com os equipamentos (leitores faciais, guarita, câmeras/DVRs)
- Internet durante a instalação (baixa Node 20, PostgreSQL, nginx, MediaMTX)

## 2. Instalação

### Opção A — Do release oficial (recomendada; sem acesso ao repositório)

```bash
# 1. Descobrir a versão atual e baixar o pacote
curl -s https://cloud.onlitec.com.br/downloads/latest.json
curl -fsSLO https://cloud.onlitec.com.br/downloads/onliacesso-linux-<versão>.tar.gz
curl -fsSLO https://cloud.onlitec.com.br/downloads/onliacesso-linux-<versão>.tar.gz.sha256

# 2. Conferir a integridade
sha256sum -c onliacesso-linux-<versão>.tar.gz.sha256

# 3. Extrair e instalar
tar -xzf onliacesso-linux-<versão>.tar.gz
cd onliacesso-linux-<versão>
sudo ./install.sh            # acrescente --no-vms para instalar SEM o módulo de câmeras
```

Alternativa em um passo (se você já tem o `bootstrap.sh` em mãos — ele está
dentro do pacote e no repositório): `sudo ./bootstrap.sh --from-release` baixa
o pacote, confere o SHA256 automaticamente e instala.

### Opção B — Do código-fonte (desenvolvimento; exige acesso ao repo privado)

```bash
git clone https://github.com/onlitec/access-control-system.git
cd access-control-system
sudo ./installer/linux/bootstrap.sh      # compila os 4 apps e instala
```

### O que o instalador faz

1. Instala dependências via apt: Node.js 20 (NodeSource), PostgreSQL,
   nginx, e as libs de runtime do módulo de crachás (cairo/pango).
2. Cria o usuário de serviço `onliacesso` (sem shell) e a árvore
   `/opt/onliacesso/{apps,config,data,logs,backups,binaries}`.
3. Cria o banco `onliacesso` com senha aleatória, roda as migrações
   (`prisma migrate deploy`) e o **admin inicial**.
4. Gera o `.env` com segredos aleatórios por instalação (`JWT_SECRET`,
   `VMS_INTERNAL_TOKEN`, senha do banco) — é isso que garante o isolamento
   entre clientes no cloud.
5. Instala os serviços systemd e o site do nginx (porta 80).
6. Com VMS: baixa o MediaMTX 1.9.3 e o rclone, e cria os serviços de vídeo.
7. Grava as credenciais iniciais em
   **`/opt/onliacesso/config/credenciais.txt`** (modo 600).

Tempo típico: 5–10 minutos. O instalador é **idempotente**: rodar de novo
atualiza os apps preservando banco, `.env` e gravações.

## 3. Primeiro acesso

Ao final, o instalador imprime os endereços. No navegador (na rede local):

| Aplicação | URL |
|---|---|
| Painel do operador (portaria) | `http://<IP-do-servidor>/painel/` |
| Painel administrativo | `http://<IP-do-servidor>/admin/` |
| Portal do morador/visitante | `http://<IP-do-servidor>/login` |

Credenciais iniciais em `/opt/onliacesso/config/credenciais.txt`:

```
Admin inicial: admin@onliacesso.local
Senha inicial: <gerada aleatoriamente>
```

**Anote e apague o arquivo depois.** Primeiros passos recomendados no Admin:

1. **Configurações → E-mail (SMTP)** — necessário para códigos de verificação
   e primeiro acesso de moradores.
2. Criar os usuários reais (operadores/administradores) e trocar/desativar o
   admin inicial.
3. Cadastrar torres/unidades, moradores e equipamentos.
4. (Opcional) **Configurações → Acesso via nuvem** — publica as câmeras em
   `cloud.onlitec.com.br` (ver `docs/CLOUD-E-RELEASES.md`). Informe o código
   do cliente e a chave de ativação fornecida pela Onlitec.

## 4. Serviços e operação

| Serviço systemd | Função | Porta |
|---|---|---|
| `onliacesso-api` | Backend (Express + Prisma) | 3001 |
| `onliacesso-visitor` | Portal do morador (Next.js) | 3002 |
| `onliacesso-vms` | Gerenciador de câmeras/gravações | 3011 |
| `onliacesso-mediamtx` | Streaming (HLS/WebRTC/RTSP) | 8888/8889/8554 |
| `nginx` | Painéis SPA + proxy (entrada única) | 80 |
| `postgresql` | Banco de dados | 5432 (localhost) |

Comandos úteis:

```bash
systemctl status onliacesso-api          # estado de um serviço
sudo systemctl restart onliacesso-api    # reiniciar (ou pela tela Serviços do Admin)
journalctl -u onliacesso-api -f          # logs ao vivo
sudo -u postgres psql -d onliacesso      # acesso ao banco
```

A tela **Admin → Serviços** lista e reinicia os serviços pelo navegador
(via sudoers restrito criado pelo instalador).

## 5. Atualização

1. O **Admin → Configurações → Atualizações → Verificar agora** avisa quando há
   versão nova (consulta `https://cloud.onlitec.com.br/downloads/latest.json`).
2. Para aplicar: baixe o tar.gz novo, confira o SHA256 e rode
   `sudo ./install.sh` por cima — **banco, `.env`, gravações e configurações
   são preservados** (migrações de banco rodam automaticamente).

## 6. Desinstalação

```bash
sudo /opt/onliacesso/uninstall.sh   # (também disponível dentro do pacote)
```

Remove serviços, site do nginx e aplicativos. O banco e as gravações só são
removidos se você confirmar.

## 7. Solução de problemas

| Sintoma | Verificação |
|---|---|
| Página não abre | `systemctl status nginx onliacesso-api`; `sudo nginx -t` |
| `/painel` ou `/admin` dá 404 | Instalação antiga sem o redirect — use a barra final (`/painel/`) ou atualize |
| Login falha com o admin inicial | Confira `credenciais.txt`; o e-mail é `admin@onliacesso.local` |
| API não sobe | `journalctl -u onliacesso-api -n 50` — geralmente `.env` ausente ou banco fora do ar |
| Câmera sem imagem | `journalctl -u onliacesso-vms -n 50` e `Admin → Câmeras → status do canal` |
| E-mails não saem | SMTP não configurado — Admin → Configurações → E-mail |
| Cloud não habilita | O botão mostra o passo que falhou (tailscale/firewall/registro/TURN); ver `docs/CLOUD-E-RELEASES.md` §4 |

Suporte: Onlitec — galvatec@gmail.com
