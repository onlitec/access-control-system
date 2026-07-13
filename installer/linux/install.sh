#!/usr/bin/env bash
# OnliAcesso — instalação nativa no Linux (Debian/Ubuntu), equivalente ao
# instalador Windows: mesmos serviços, mesmas portas, mesmo comportamento.
#
#   sudo ./install.sh                  # instala/atualiza
#   sudo ./install.sh --no-vms         # sem o Gerenciador de Imagens (câmeras)
#
# Idempotente: rodar de novo atualiza os apps e preserva banco, .env, gravações
# e mediamtx.yml. Precisa de internet (pacotes apt, Node, MediaMTX, npm).
set -euo pipefail

# ── Parâmetros ────────────────────────────────────────────────────────────────
APP_DIR="/opt/onliacesso"
APP_USER="onliacesso"
NODE_MAJOR="20"                 # o backend usa o prebuild do canvas para a ABI do Node 20
MEDIAMTX_VERSION="v1.9.3"       # mesma versão homologada no Windows
DB_NAME="onliacesso"
DB_USER="onliacesso"
INSTALL_VMS=1

for arg in "$@"; do
    case "$arg" in
        --no-vms) INSTALL_VMS=0 ;;
        *) echo "Argumento desconhecido: $arg"; exit 1 ;;
    esac
done

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# versão vem do arquivo VERSION gerado pelo build (fonte única: package.json)
PKG_VERSION="$(cat "$SRC_DIR/VERSION" 2>/dev/null || echo 0.0.0)"

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m[!]\033[0m $*"; }
die()  { echo -e "\033[1;31m[ERRO]\033[0m $*" >&2; exit 1; }

[ "$EUID" -eq 0 ] || die "Execute como root: sudo ./install.sh"
command -v apt-get >/dev/null || die "Este instalador suporta Debian/Ubuntu (apt)."

# Porta 80 livre? (nginx do próprio OnliAcesso pode já estar rodando — tudo bem)
if ss -lntp 2>/dev/null | grep -q ':80 ' && ! systemctl is-active --quiet nginx; then
    die "A porta 80 já está em uso por outro serviço. Libere-a antes de instalar."
fi

# ── 1. Dependências do sistema ────────────────────────────────────────────────
log "Instalando dependências do sistema (apt)..."
export DEBIAN_FRONTEND=noninteractive
# Um PPA de terceiro quebrado (ou que mudou de Label) faz o `apt-get update`
# retornar erro e, com `set -e`, derrubaria a instalação inteira. O que importa
# são os repositórios oficiais; avisos de terceiros não podem ser fatais.
apt-get update -qq --allow-releaseinfo-change 2>/dev/null \
    || apt-get update -qq 2>/dev/null \
    || warn "apt-get update retornou avisos (repositório de terceiros?) — seguindo assim mesmo."

# net-tools: o discovery de rede lê a tabela ARP com `arp -a`
# libcairo2/libpango/libjpeg/libgif: runtime do `canvas` (comparação facial)
apt-get install -y -qq \
    curl ca-certificates gnupg unzip rsync openssl \
    ffmpeg net-tools iproute2 \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgif7 librsvg2-2

# libjpeg: o nome do pacote muda entre Ubuntu e Debian — tenta os dois em vez de
# derrubar a instalação inteira por causa de um nome.
apt-get install -y -qq libjpeg-turbo8 2>/dev/null \
    || apt-get install -y -qq libjpeg62-turbo 2>/dev/null \
    || warn "libjpeg não instalada — a comparação facial (canvas) pode falhar."

# PostgreSQL e nginx: instalados apenas se AINDA NÃO existirem. Numa máquina que
# já tem um cluster (ou um repositório pgdg com versão mais nova), instalar o
# meta-pacote `postgresql` dispara um pg_upgradecluster que pode falhar e
# abortar a instalação inteira — visto num servidor com PostGIS instalado.
if command -v psql >/dev/null 2>&1; then
    log "PostgreSQL já presente ($(psql --version | awk '{print $3}')) — reaproveitando."
else
    apt-get install -y -qq postgresql postgresql-contrib
fi

if command -v nginx >/dev/null 2>&1; then
    log "nginx já presente — reaproveitando."
else
    apt-get install -y -qq nginx
fi

# ── 2. Node.js ────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]; then
    log "Instalando Node.js ${NODE_MAJOR}.x (NodeSource)..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    apt-get install -y nodejs >/dev/null
fi
log "Node: $(node -v) / npm: $(npm -v)"

# ── 3. Usuário e diretórios ───────────────────────────────────────────────────
id -u "$APP_USER" >/dev/null 2>&1 || {
    log "Criando usuário de serviço '$APP_USER'..."
    useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
}
mkdir -p "$APP_DIR"/{apps,config,data/recordings,logs,backups,binaries}

# ── 4. Aplicação ──────────────────────────────────────────────────────────────
log "Copiando a aplicação para $APP_DIR/apps ..."
[ -d "$SRC_DIR/apps/backend-api" ] || die "Pacote incompleto: apps/backend-api não encontrado ao lado do install.sh"
# --delete só dentro de apps/: config, data e logs são preservados
rsync -a --delete "$SRC_DIR/apps/" "$APP_DIR/apps/"

log "Instalando dependências do backend (npm, produção)..."
pushd "$APP_DIR/apps/backend-api" >/dev/null
npm install --omit=dev --no-audit --no-fund --loglevel=error
npx prisma generate --schema prisma/schema.prisma >/dev/null
popd >/dev/null

# ── 5. PostgreSQL ─────────────────────────────────────────────────────────────
systemctl enable --now postgresql >/dev/null 2>&1 || true

# `postgresql.service` no Debian/Ubuntu é um META-serviço: ele reporta "active"
# mesmo quando o cluster está DOWN (visto numa máquina com dois clusters
# instalados). O que vale é o servidor aceitar conexões.
if ! pg_isready -q 2>/dev/null; then
    CLUSTER="$(pg_lsclusters -h 2>/dev/null | awk '$4 != "online" { print $1 "-" $2; exit }')"
    if [ -n "$CLUSTER" ]; then
        log "Subindo o cluster PostgreSQL $CLUSTER ..."
        systemctl start "postgresql@$CLUSTER" 2>/dev/null || pg_ctlcluster ${CLUSTER%%-*} ${CLUSTER#*-} start 2>/dev/null || true
    fi
    for _ in $(seq 1 10); do pg_isready -q 2>/dev/null && break; sleep 2; done
fi
pg_isready -q 2>/dev/null || die "PostgreSQL não está aceitando conexões. Verifique com: pg_lsclusters e journalctl -u postgresql@*"

# O cluster pode não estar na 5432 (outra instância na máquina, como o próprio
# instalador Windows faz ao desviar para 5433) — o DATABASE_URL segue o cluster.
PG_PORT="$(pg_lsclusters -h 2>/dev/null | awk '$4 == "online" { print $3; exit }')"
[ -n "$PG_PORT" ] || PG_PORT=5432
log "PostgreSQL online na porta $PG_PORT."

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    log "Banco de dados já existe — preservando dados."
    DB_PASSWORD="$(grep -oP '(?<=postgresql://'"$DB_USER"':)[^@]+' "$APP_DIR/config/.env" 2>/dev/null || true)"
    [ -n "$DB_PASSWORD" ] || die "Banco existe mas a senha não está em $APP_DIR/config/.env — restaure o .env ou remova o banco."
else
    log "Criando banco de dados e usuário..."
    DB_PASSWORD="$(openssl rand -hex 24)"
    sudo -u postgres psql -qc "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
    sudo -u postgres psql -qc "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
fi

# ── 6. Configuração (.env) ────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/config/.env"
LOCAL_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"
[ -n "$LOCAL_IP" ] || LOCAL_IP="127.0.0.1"

# O backup do painel chama $PG_BIN/pg_dump. Em Debian/Ubuntu os binários em
# /usr/bin são wrappers que despacham para a versão do cluster ativo — mais
# seguro que apontar para /usr/lib/postgresql/<versão>/bin, que pode ter mais de
# uma versão instalada (visto numa máquina com os clusters 16 e 18).
PG_BIN_DIR="$(dirname "$(command -v pg_dump || echo /usr/bin/pg_dump)")"

if [ ! -f "$ENV_FILE" ]; then
    log "Gerando configuração inicial (IP detectado: $LOCAL_IP)..."
    JWT_SECRET="$(openssl rand -hex 32)"
    VMS_TOKEN="$(openssl rand -hex 32)"
    ADMIN_PASSWORD="$(openssl rand -hex 12)"

    cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3001
APP_URL=http://$LOCAL_IP
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:$PG_PORT/$DB_NAME?schema=public
JWT_SECRET=$JWT_SECRET
PROVIDER_TYPE=local

INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_EMAIL=admin@onliacesso.local
INITIAL_ADMIN_PASSWORD=$ADMIN_PASSWORD

FFMPEG_PATH=/usr/bin/ffmpeg
BACKUP_DIR=$APP_DIR/backups
PG_BIN=$PG_BIN_DIR
SERVICE_LOGS_DIR=$APP_DIR/logs
APP_VERSION=$PKG_VERSION

# Manifesto de atualizações (o Admin compara e avisa quando há versão nova)
UPDATE_MANIFEST_URL=https://cloud.onlitec.com.br/downloads/latest.json

# ── VMS (Gerenciador de Imagens) ──
MEDIAMTX_API_URL=http://127.0.0.1:9997
VMS_PORT=3011
VMS_RECORDINGS_DIR=$APP_DIR/data/recordings
VMS_INTERNAL_TOKEN=$VMS_TOKEN
VMS_MAX_DISK_GB=0
VMS_MIN_FREE_GB=10
VMS_ALWAYS_ON=true
RCLONE_PATH=/usr/bin/rclone
RCLONE_CONFIG=$APP_DIR/config/rclone.conf

# VCA (detecção inteligente por software): modelo YOLO baixado abaixo
VCA_MODEL_PATH=$APP_DIR/config/yolov8n.onnx
EOF

    # SMTP: os mesmos padrões do instalador Windows, se disponíveis
    if [ -f "$SRC_DIR/smtp-defaults.env" ]; then
        cat "$SRC_DIR/smtp-defaults.env" >> "$ENV_FILE"
        log "Padrões de SMTP aplicados."
    else
        warn "smtp-defaults.env ausente — configure o SMTP no painel Admin depois."
    fi

    cat > "$APP_DIR/config/credenciais.txt" <<EOF
OnliAcesso - Credenciais geradas na instalacao ($(date '+%Y-%m-%d %H:%M'))
GUARDE ESTE ARQUIVO EM LOCAL SEGURO E APAGUE-O DEPOIS.

Painel:  http://$LOCAL_IP/painel/
Admin:   http://$LOCAL_IP/admin/
Portal:  http://$LOCAL_IP/login/

Admin inicial: admin@onliacesso.local
Senha inicial: $ADMIN_PASSWORD

PostgreSQL (usuario $DB_USER): $DB_PASSWORD
EOF
    chmod 600 "$APP_DIR/config/credenciais.txt"
else
    log "Configuração existente preservada ($ENV_FILE)."
    # mantém APP_URL coerente se o IP da máquina mudou
    sed -i "s#^APP_URL=.*#APP_URL=http://$LOCAL_IP#" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

# ── 7. Migrações do banco ─────────────────────────────────────────────────────
log "Aplicando migrações do banco..."
pushd "$APP_DIR/apps/backend-api" >/dev/null
set -a; . "$ENV_FILE"; set +a
npx prisma migrate deploy --schema prisma/schema.prisma

# Usuário administrador inicial, a partir das chaves INITIAL_ADMIN_* do .env.
# NÃO usar bootstrap-admin.js: ele lê ADMIN_*/ADMIN_PASSWORD (nomes diferentes)
# e falha. Sem este passo o banco fica sem nenhum usuário e o login é impossível.
if [ -f dist/scripts/create-protected-admin.js ]; then
    log "Criando o usuário administrador inicial..."
    node dist/scripts/create-protected-admin.js
else
    warn "create-protected-admin.js não encontrado — admin inicial NÃO criado."
fi
popd >/dev/null

# ── 8. VMS: MediaMTX e rclone ─────────────────────────────────────────────────
if [ "$INSTALL_VMS" -eq 1 ]; then
    if [ ! -x "$APP_DIR/binaries/mediamtx" ]; then
        log "Baixando MediaMTX $MEDIAMTX_VERSION ..."
        ARCH="$(uname -m)"
        case "$ARCH" in
            x86_64)  MTX_ARCH="linux_amd64" ;;
            aarch64) MTX_ARCH="linux_arm64v8" ;;
            *) die "Arquitetura não suportada para o MediaMTX: $ARCH" ;;
        esac
        TMP="$(mktemp -d)"
        curl -fsSL -o "$TMP/mediamtx.tar.gz" \
            "https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_${MTX_ARCH}.tar.gz"
        tar -xzf "$TMP/mediamtx.tar.gz" -C "$TMP"
        install -m 755 "$TMP/mediamtx" "$APP_DIR/binaries/mediamtx"
        rm -rf "$TMP"
    fi

    command -v rclone >/dev/null || {
        log "Instalando rclone (upload das gravações para a nuvem)..."
        curl -fsSL https://rclone.org/install.sh | bash >/dev/null 2>&1 || \
            apt-get install -y rclone >/dev/null
    }

    # mediamtx.yml: preservado em upgrades (pode ter STUN/TURN configurado)
    [ -f "$APP_DIR/config/mediamtx.yml" ] || cp "$SRC_DIR/mediamtx/mediamtx.yml" "$APP_DIR/config/mediamtx.yml"

    # VCA (detecção inteligente por software): modelo YOLO (~12 MB). O runtime
    # onnxruntime-node vem via npm (optionalDependency); se o download falhar o
    # VCA fica só inativo (o backend degrada gracioso).
    VCA_MODEL_SHA="c1b068a5057a894f3e3fa15b3393b037a3287eae8fbf7b27018c6d4b16a2c7e4"
    if [ ! -f "$APP_DIR/config/yolov8n.onnx" ]; then
        log "Baixando modelo de IA (VCA)..."
        if curl -fsSL -o "$APP_DIR/config/yolov8n.onnx" https://cloud.onlitec.com.br/downloads/models/yolov8n.onnx; then
            echo "$VCA_MODEL_SHA  $APP_DIR/config/yolov8n.onnx" | sha256sum -c - >/dev/null 2>&1 \
                || { warn "SHA256 do modelo VCA não confere — removendo (VCA ficará inativo)."; rm -f "$APP_DIR/config/yolov8n.onnx"; }
        else
            warn "Não foi possível baixar o modelo VCA — a detecção inteligente ficará inativa."
        fi
    fi
fi

# ── 9. Serviços systemd ───────────────────────────────────────────────────────
log "Registrando serviços systemd..."
SERVICES=(onliacesso-api onliacesso-visitor)
[ "$INSTALL_VMS" -eq 1 ] && SERVICES+=(onliacesso-mediamtx onliacesso-vms)

for svc in "${SERVICES[@]}"; do
    install -m 644 "$SRC_DIR/systemd/$svc.service" "/etc/systemd/system/$svc.service"
done
systemctl daemon-reload

# ── 9b. Permissão para reiniciar serviços pelo painel Admin ───────────────────
# A tela "Serviços" do Admin reinicia os processos. A API roda sem privilégios,
# então recebe uma regra sudoers ESTRITA: só `systemctl restart` e só nestes
# units — nada mais. Sem isto, a listagem continua funcionando e apenas o botão
# de reiniciar falha.
log "Autorizando o reinício dos serviços pelo painel (sudoers restrito)..."
SUDO_UNITS="onliacesso-api onliacesso-visitor onliacesso-vms onliacesso-mediamtx nginx postgresql"
SUDO_CMDS=""
for u in $SUDO_UNITS; do
    SUDO_CMDS="$SUDO_CMDS/usr/bin/systemctl restart $u, "
done
cat > /etc/sudoers.d/onliacesso <<EOF
# Gerado pelo instalador do OnliAcesso — permite que a API reinicie os próprios
# serviços pelo painel Admin, sem senha e sem nenhum outro poder de root.
$APP_USER ALL=(root) NOPASSWD: ${SUDO_CMDS%, }
# Botão "Habilitar acesso via nuvem" (painel Admin → Configurações): firewall
# restrito ao VPS e entrada na tailnet. Nada além disso.
$APP_USER ALL=(root) NOPASSWD: /usr/sbin/ufw status, /usr/sbin/ufw allow *, /usr/bin/tailscale ip -4, /usr/bin/tailscale up *
EOF
chmod 440 /etc/sudoers.d/onliacesso
visudo -cf /etc/sudoers.d/onliacesso >/dev/null || {
    rm -f /etc/sudoers.d/onliacesso
    warn "Regra sudoers inválida — removida. O botão 'reiniciar serviço' do Admin não funcionará."
}

# ── 10. nginx ─────────────────────────────────────────────────────────────────
log "Configurando o nginx..."
install -m 644 "$SRC_DIR/nginx/onliacesso.conf" /etc/nginx/sites-available/onliacesso
ln -sf /etc/nginx/sites-available/onliacesso /etc/nginx/sites-enabled/onliacesso
rm -f /etc/nginx/sites-enabled/default          # o default do Debian também escuta em :80
nginx -t >/dev/null || die "Configuração do nginx inválida."

# ── 11. Permissões ────────────────────────────────────────────────────────────
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 755 "$APP_DIR"
# o nginx (www-data) precisa atravessar até os arquivos dos SPAs
chmod o+x "$APP_DIR" "$APP_DIR/apps"

# ── 12. Firewall ──────────────────────────────────────────────────────────────
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 80/tcp >/dev/null && log "Firewall: porta 80/tcp liberada."
    if [ "$INSTALL_VMS" -eq 1 ]; then
        # A mídia do WebRTC vai DIRETO do MediaMTX ao navegador em UDP 8189 —
        # sem esta regra o vídeo ao vivo não aparece de outro PC da rede.
        ufw allow 8189/udp >/dev/null && log "Firewall: porta 8189/udp liberada (WebRTC)."
    fi
fi

# ── 13. Subir tudo ────────────────────────────────────────────────────────────
log "Iniciando serviços..."
# `enable --now` NÃO reinicia um serviço que já está rodando: numa atualização,
# os processos continuariam com o código (e o unit) antigos. O restart explícito
# é o que faz a nova versão realmente entrar em vigor.
systemctl enable "${SERVICES[@]}" >/dev/null 2>&1
systemctl restart "${SERVICES[@]}"
systemctl restart nginx
sleep 3

FAILED=()
for svc in "${SERVICES[@]}" nginx postgresql; do
    systemctl is-active --quiet "$svc" || FAILED+=("$svc")
done

echo
if [ ${#FAILED[@]} -eq 0 ]; then
    echo -e "\033[1;32m✓ OnliAcesso instalado e no ar.\033[0m"
else
    warn "Serviços que NÃO subiram: ${FAILED[*]}"
    warn "Diagnóstico: journalctl -u ${FAILED[0]} -n 50 --no-pager"
fi

cat <<EOF

  Painel do operador : http://$LOCAL_IP/painel/
  Painel admin       : http://$LOCAL_IP/admin/
  Portal do morador  : http://$LOCAL_IP/login/

  Credenciais iniciais: $APP_DIR/config/credenciais.txt  (apague depois de anotar)
  Logs                : $APP_DIR/logs/  ·  journalctl -u onliacesso-api -f

EOF

if [ "$INSTALL_VMS" -eq 1 ]; then
cat <<EOF
  Para o backup das gravações na nuvem, configure o rclone:
    sudo -u $APP_USER rclone config --config $APP_DIR/config/rclone.conf
  e cadastre o destino no Admin → VMS → Armazenamento.

EOF
fi
