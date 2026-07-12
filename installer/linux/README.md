# OnliAcesso no Linux — instalação nativa

Instala o sistema completo num servidor **Debian/Ubuntu**, com o mesmo comportamento da versão Windows: mesmas portas, mesmas rotas, mesmos dados. Os serviços rodam no **systemd** (não em Docker) e o PostgreSQL e o nginx são os do próprio sistema.

## Como gerar o pacote

Na máquina de desenvolvimento (Windows/Git Bash ou Linux), com os apps já compilados:

```bash
cd installer/linux
bash build-package-linux.sh
# → installer/dist/onliacesso-linux-2.2.0.tar.gz
```

## Como instalar no servidor

```bash
scp onliacesso-linux-2.2.0.tar.gz usuario@servidor:/tmp/
ssh usuario@servidor
tar -xzf /tmp/onliacesso-linux-2.2.0.tar.gz -C /tmp
cd /tmp/onliacesso-linux-2.2.0
sudo ./install.sh              # ou: sudo ./install.sh --no-vms
```

O servidor **precisa de internet** durante a instalação: o pacote não traz `node_modules` (as dependências nativas — `canvas`, engines do Prisma — têm de ser baixadas/compiladas para o Linux), nem o MediaMTX, que é baixado na hora.

Ao final o script mostra as URLs e onde estão as credenciais iniciais.

## O que o install.sh faz

1. Instala pelo apt: PostgreSQL, nginx, ffmpeg, `net-tools` (o discovery lê a tabela ARP) e as bibliotecas do `canvas` (comparação facial).
2. Instala o **Node 20** (NodeSource) — a versão importa: o `canvas` escolhe o binário pré-compilado pela ABI do Node.
3. Cria o usuário de serviço `onliacesso` e a árvore em `/opt/onliacesso`.
4. Copia os apps, roda `npm install --omit=dev` e gera o Prisma Client.
5. Cria banco e usuário no PostgreSQL (senha aleatória) e aplica as migrações.
6. Gera o `.env` com segredos aleatórios e **detecta o IP da máquina**.
7. Baixa o **MediaMTX** e instala o **rclone** (se o VMS foi escolhido).
8. Registra os serviços systemd, configura o nginx e libera o firewall (80/tcp e 8189/udp).

É **idempotente**: rodar de novo atualiza a aplicação e **preserva** banco, `.env`, gravações e `mediamtx.yml`.

## Arquitetura instalada

```
/opt/onliacesso/
├── apps/          backend-api, frontend-visitor, frontend-access, frontend-admin
├── config/        .env, credenciais.txt, mediamtx.yml, rclone.conf
├── data/          recordings/  ← gravações
├── binaries/      mediamtx
├── logs/
└── backups/
```

| Serviço | Porta | O que é |
|---|---|---|
| `onliacesso-api` | 3001 | API (Express + Prisma) |
| `onliacesso-visitor` | 3002 | Portal do morador (Next.js) |
| `onliacesso-vms` | 3011 | Gravação, retenção e upload para a nuvem |
| `onliacesso-mediamtx` | — | Streaming das câmeras (RTSP/HLS/WebRTC) |
| `postgresql`, `nginx` | 5432 / 80 | Do sistema |

**Diferença consciente para o Windows**: lá os painéis `/painel/` e `/admin/` são servidos por dois processos Node (`serve-static.js`), porque o nginx empacotado é mínimo. Aqui o **próprio nginx** entrega esses arquivos — dois serviços a menos, mesmo resultado.

## Operação

```bash
systemctl status onliacesso-api          # estado
journalctl -u onliacesso-vms -f          # logs ao vivo
systemctl restart onliacesso-api         # reiniciar
ls /opt/onliacesso/logs/                 # logs em arquivo
```

## Depois de instalar

1. **Backup na nuvem (Google Drive)** — o token é uma credencial pessoal e não vai no pacote:
   ```bash
   sudo -u onliacesso rclone config --config /opt/onliacesso/config/rclone.conf
   ```
   Depois cadastre o destino em **Admin → VMS → Armazenamento**.

2. **Cadastrar os equipamentos** — banco novo é banco vazio. Use a **varredura de rede** (Admin → Dispositivos e Servidores) para encontrar câmeras, DVRs e terminais faciais.

3. **Acesso remoto (opcional)** — instale o Tailscale e rode:
   ```bash
   sudo ./enable-cloud-access.sh 100.90.27.7      # IP Tailscale do VPS
   ```
   Depois aponte o proxy do VPS para o **nome MagicDNS** desta máquina (ver `deploy/cloud/README.md`).

## Requisitos de rede

- O servidor precisa estar **na mesma rede (L2) dos equipamentos**. Em VM, use rede em **bridge**, não NAT: com NAT a descoberta ONVIF/SADP (multicast/broadcast) não funciona e as câmeras podem ficar inalcançáveis.
- O WebRTC entrega a mídia em **UDP 8189** direto ao navegador — sem essa porta liberada, o vídeo ao vivo não aparece de outras máquinas (o `install.sh` já libera no ufw).

## Desinstalar

```bash
sudo ./uninstall.sh            # remove serviços e apps; preserva banco e gravações
sudo ./uninstall.sh --purge    # remove tudo, inclusive banco e gravações
```
