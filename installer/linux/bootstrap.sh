#!/usr/bin/env bash
# OnliAcesso — instalação COMPLETA no Ubuntu/Debian a partir do código-fonte.
#
# Faz tudo, do zero: instala as dependências do sistema, o Node, compila os
# quatro aplicativos e instala o sistema em /opt/onliacesso com os serviços
# systemd no ar.
#
#   sudo ./bootstrap.sh                # compila e instala (a partir deste repo)
#   sudo ./bootstrap.sh --no-vms       # sem o Gerenciador de Imagens (câmeras)
#
#   sudo ./bootstrap.sh --from-release # SEM código-fonte: baixa o pacote oficial
#                                      # de cloud.onlitec.com.br/downloads (não
#                                      # exige credencial nenhuma — é o caminho
#                                      # para instalar na casa do cliente)
#
# Se rodado FORA do repositório (e sem --from-release), clona-o antes
# (repositório privado — exige credencial git, veja o README):
#   sudo ONLIACESSO_REPO=https://github.com/onlitec/access-control-system.git ./bootstrap.sh
#
# Idempotente: rodar de novo recompila e atualiza, preservando banco, .env e
# gravações.
set -euo pipefail

NODE_MAJOR="20"
REPO_URL="${ONLIACESSO_REPO:-https://github.com/onlitec/access-control-system.git}"
REPO_BRANCH="${ONLIACESSO_BRANCH:-main}"
SRC_DIR="${ONLIACESSO_SRC:-/opt/onliacesso-src}"
DOWNLOADS_URL="${ONLIACESSO_DOWNLOADS:-https://cloud.onlitec.com.br/downloads}"
FROM_RELEASE=0
INSTALL_ARGS=()

for arg in "$@"; do
    case "$arg" in
        --no-vms) INSTALL_ARGS+=("--no-vms") ;;
        --from-release) FROM_RELEASE=1 ;;
        *) echo "Argumento desconhecido: $arg"; exit 1 ;;
    esac
done

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m[!]\033[0m $*"; }
die()  { echo -e "\033[1;31m[ERRO]\033[0m $*" >&2; exit 1; }

[ "$EUID" -eq 0 ] || die "Execute como root: sudo ./bootstrap.sh"
command -v apt-get >/dev/null || die "Este script suporta Ubuntu/Debian (apt)."

START_TS=$(date +%s)

# ── Modo --from-release: baixa o pacote oficial e instala, sem compilar nada ──
if [ "$FROM_RELEASE" -eq 1 ]; then
    log "Instalação a partir do release oficial ($DOWNLOADS_URL)..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq --allow-releaseinfo-change 2>/dev/null || true
    apt-get install -y -qq curl ca-certificates python3 rsync

    VERSION="$(curl -fsSL "$DOWNLOADS_URL/latest.json" \
        | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])')" \
        || die "Não consegui ler $DOWNLOADS_URL/latest.json"
    SHA="$(curl -fsSL "$DOWNLOADS_URL/latest.json" \
        | python3 -c 'import sys,json;print(json.load(sys.stdin).get("linux",{}).get("sha256",""))')"
    TARBALL_NAME="onliacesso-linux-$VERSION.tar.gz"

    log "Baixando OnliAcesso $VERSION ..."
    WORK="$(mktemp -d)"
    curl -fSL --progress-bar -o "$WORK/$TARBALL_NAME" "$DOWNLOADS_URL/$TARBALL_NAME" \
        || die "Falha ao baixar $DOWNLOADS_URL/$TARBALL_NAME"
    if [ -n "$SHA" ]; then
        echo "$SHA  $WORK/$TARBALL_NAME" | sha256sum -c - >/dev/null \
            || die "SHA256 do pacote não confere — download corrompido ou adulterado."
        log "SHA256 conferido."
    else
        warn "latest.json sem sha256 do Linux — instalando sem conferência."
    fi

    tar -xzf "$WORK/$TARBALL_NAME" -C "$WORK"
    bash "$WORK/onliacesso-linux-$VERSION/install.sh" "${INSTALL_ARGS[@]+"${INSTALL_ARGS[@]}"}"
    rm -rf "$WORK"

    ELAPSED=$(( ($(date +%s) - START_TS) / 60 ))
    echo -e "\n\033[1;32m✓ Instalação do release $VERSION concluída em ~${ELAPSED} min.\033[0m"
    exit 0
fi

# ── 1. Ferramentas de compilação ──────────────────────────────────────────────
log "Instalando ferramentas de compilação..."
export DEBIAN_FRONTEND=noninteractive
# PPA de terceiro quebrado não pode derrubar a instalação (ver install.sh)
apt-get update -qq --allow-releaseinfo-change 2>/dev/null \
    || apt-get update -qq 2>/dev/null \
    || warn "apt-get update retornou avisos — seguindo assim mesmo."

# build-essential/python3: o node-gyp precisa deles se o `canvas` não tiver
# prebuild para esta plataforma. rsync: usado pelo install.sh.
apt-get install -y -qq git curl ca-certificates build-essential python3 pkg-config rsync

# libs de desenvolvimento do canvas (só necessárias se cair no build do node-gyp)
apt-get install -y -qq libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    2>/dev/null || warn "Libs de desenvolvimento do canvas não instaladas (ok se houver prebuild)."

# ── 2. Node.js ────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]; then
    log "Instalando Node.js ${NODE_MAJOR}.x ..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    apt-get install -y -qq nodejs
fi
log "Node $(node -v) · npm $(npm -v)"

# ── 3. Código-fonte ───────────────────────────────────────────────────────────
# Se este script está dentro do repositório, usa o próprio; senão, clona.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HERE/../../package.json" ] && [ -d "$HERE/../../backend-api" ]; then
    REPO_DIR="$(cd "$HERE/../.." && pwd)"
    log "Usando o repositório local: $REPO_DIR"
else
    if [ -d "$SRC_DIR/.git" ]; then
        log "Atualizando o código em $SRC_DIR ..."
        git -C "$SRC_DIR" fetch --depth 1 origin "$REPO_BRANCH"
        git -C "$SRC_DIR" reset --hard "origin/$REPO_BRANCH"
    else
        log "Clonando $REPO_URL ($REPO_BRANCH) em $SRC_DIR ..."
        git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$SRC_DIR" \
            || die "Falha ao clonar. O repositório é PRIVADO: configure uma credencial git (token ou chave SSH) antes."
    fi
    REPO_DIR="$SRC_DIR"
fi

# ── 4. Compilação dos aplicativos ─────────────────────────────────────────────
log "Instalando dependências do monorepo (pode demorar alguns minutos)..."
pushd "$REPO_DIR" >/dev/null
npm install --no-audit --no-fund --loglevel=error

log "Compilando backend-api, frontend-access, frontend-admin e frontend-visitor..."
npm run build

# Sanidade: o instalador exige estes artefatos
[ -d "backend-api/dist" ]      || die "backend-api não compilou."
[ -d "frontend-access/dist" ]  || die "frontend-access não compilou."
[ -d "frontend-admin/dist" ]   || die "frontend-admin não compilou."
[ -f "frontend-visitor/.next/standalone/frontend-visitor/server.js" ] \
    || die "frontend-visitor não gerou o build standalone (confira output:'standalone' no next.config)."
popd >/dev/null

# ── 5. Empacotar e instalar ───────────────────────────────────────────────────
log "Montando o pacote de instalação..."
pushd "$REPO_DIR/installer/linux" >/dev/null
bash build-package-linux.sh
popd >/dev/null

VERSION="$(sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$REPO_DIR/package.json" | head -1)"
TARBALL="$REPO_DIR/installer/dist/onliacesso-linux-$VERSION.tar.gz"
[ -f "$TARBALL" ] || die "Pacote não gerado: $TARBALL"

log "Instalando o OnliAcesso $VERSION ..."
WORK="$(mktemp -d)"
tar -xzf "$TARBALL" -C "$WORK"
bash "$WORK/onliacesso-linux-$VERSION/install.sh" "${INSTALL_ARGS[@]+"${INSTALL_ARGS[@]}"}"
rm -rf "$WORK"

ELAPSED=$(( ($(date +%s) - START_TS) / 60 ))
echo -e "\n\033[1;32m✓ Bootstrap concluído em ~${ELAPSED} min.\033[0m"
