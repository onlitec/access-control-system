#!/usr/bin/env bash
# Baixa e extrai os binários Windows necessários para o instalador OnliAcesso.
# Uso: bash download-binaries.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../assets/binaries"
DOWNLOAD_DIR="$ASSETS_DIR/.downloads"
mkdir -p "$ASSETS_DIR" "$DOWNLOAD_DIR"

NODE_VERSION="20.20.2"
PG_VERSION="16.13-1"
NGINX_VERSION="1.26.3"
WINSW_VERSION="3.0.0-alpha.11"

NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
NODE_SHASUMS_URL="https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
PG_URL="https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-windows-x64-binaries.zip"
NGINX_URL="https://nginx.org/download/nginx-${NGINX_VERSION}.zip"
WINSW_URL="https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe"
FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"
FFMPEG_API_URL="https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest"

CHECKSUM_FILE="$ASSETS_DIR/CHECKSUMS.sha256"
: > "$CHECKSUM_FILE"

log() { echo "[download-binaries] $*"; }

fetch() {
    local url="$1" dest="$2"
    if [ -f "$dest" ]; then
        log "já existe, pulando download: $(basename "$dest")"
        return 0
    fi
    log "baixando $(basename "$dest") ..."
    curl -fL --retry 3 --retry-delay 5 -o "$dest.part" "$url"
    mv "$dest.part" "$dest"
}

record_sha() {
    local file="$1"
    local sha
    sha=$(sha256sum "$file" | awk '{print $1}')
    echo "$sha  $(basename "$file")" >> "$CHECKSUM_FILE"
    log "SHA256 $(basename "$file"): $sha"
}

verify_sha() {
    local file="$1" expected="$2"
    local actual
    actual=$(sha256sum "$file" | awk '{print $1}')
    if [ "$actual" != "$expected" ]; then
        log "ERRO: SHA256 divergente para $(basename "$file")"
        log "  esperado: $expected"
        log "  obtido:   $actual"
        exit 1
    fi
    log "SHA256 verificado (fonte oficial): $(basename "$file")"
}

# ---------------------------------------------------------------- Node.js ---
NODE_ZIP="$DOWNLOAD_DIR/node-v${NODE_VERSION}-win-x64.zip"
fetch "$NODE_URL" "$NODE_ZIP"
NODE_EXPECTED=$(curl -fsSL "$NODE_SHASUMS_URL" | awk -v f="node-v${NODE_VERSION}-win-x64.zip" '$2==f {print $1}')
[ -n "$NODE_EXPECTED" ] || { log "ERRO: não achei SHA256 publicado do Node"; exit 1; }
verify_sha "$NODE_ZIP" "$NODE_EXPECTED"
record_sha "$NODE_ZIP"
if [ ! -d "$ASSETS_DIR/node" ]; then
    unzip -q "$NODE_ZIP" -d "$DOWNLOAD_DIR/node-tmp"
    mv "$DOWNLOAD_DIR/node-tmp/node-v${NODE_VERSION}-win-x64" "$ASSETS_DIR/node"
    rmdir "$DOWNLOAD_DIR/node-tmp"
fi
log "Node.js ${NODE_VERSION} pronto em assets/binaries/node"

# ------------------------------------------------------------- PostgreSQL ---
PG_ZIP="$DOWNLOAD_DIR/postgresql-${PG_VERSION}-windows-x64-binaries.zip"
fetch "$PG_URL" "$PG_ZIP"
record_sha "$PG_ZIP"
if [ ! -d "$ASSETS_DIR/pgsql" ]; then
    unzip -q "$PG_ZIP" -d "$DOWNLOAD_DIR/pg-tmp"
    mv "$DOWNLOAD_DIR/pg-tmp/pgsql" "$ASSETS_DIR/pgsql"
    rm -rf "$DOWNLOAD_DIR/pg-tmp"
    # pgAdmin e docs não são necessários no servidor — reduz ~500 MB
    rm -rf "$ASSETS_DIR/pgsql/pgAdmin 4" "$ASSETS_DIR/pgsql/doc" \
           "$ASSETS_DIR/pgsql/include" "$ASSETS_DIR/pgsql/symbols" \
           "$ASSETS_DIR/pgsql/StackBuilder"
fi
log "PostgreSQL ${PG_VERSION} pronto em assets/binaries/pgsql"

# ------------------------------------------------------------------ Nginx ---
NGINX_ZIP="$DOWNLOAD_DIR/nginx-${NGINX_VERSION}.zip"
fetch "$NGINX_URL" "$NGINX_ZIP"
record_sha "$NGINX_ZIP"
if [ ! -d "$ASSETS_DIR/nginx" ]; then
    unzip -q "$NGINX_ZIP" -d "$DOWNLOAD_DIR/nginx-tmp"
    mv "$DOWNLOAD_DIR/nginx-tmp/nginx-${NGINX_VERSION}" "$ASSETS_DIR/nginx"
    rmdir "$DOWNLOAD_DIR/nginx-tmp"
fi
log "Nginx ${NGINX_VERSION} pronto em assets/binaries/nginx"

# ------------------------------------------------------------------ WinSW ---
WINSW_EXE="$ASSETS_DIR/winsw/WinSW-x64.exe"
mkdir -p "$ASSETS_DIR/winsw"
fetch "$WINSW_URL" "$WINSW_EXE"
record_sha "$WINSW_EXE"
log "WinSW v${WINSW_VERSION} pronto em assets/binaries/winsw"

# ----------------------------------------------------------------- ffmpeg ---
FFMPEG_ZIP="$DOWNLOAD_DIR/ffmpeg-master-latest-win64-gpl.zip"
fetch "$FFMPEG_URL" "$FFMPEG_ZIP"
FFMPEG_EXPECTED=$(curl -fsSL "$FFMPEG_API_URL" | python3 -c "
import json, sys
release = json.load(sys.stdin)
for asset in release['assets']:
    if asset['name'] == 'ffmpeg-master-latest-win64-gpl.zip':
        print(asset['digest'].removeprefix('sha256:'))
")
[ -n "$FFMPEG_EXPECTED" ] || { log "ERRO: não achei SHA256 publicado do ffmpeg"; exit 1; }
verify_sha "$FFMPEG_ZIP" "$FFMPEG_EXPECTED"
record_sha "$FFMPEG_ZIP"
if [ ! -d "$ASSETS_DIR/ffmpeg" ]; then
    unzip -q "$FFMPEG_ZIP" -d "$DOWNLOAD_DIR/ffmpeg-tmp"
    mv "$DOWNLOAD_DIR/ffmpeg-tmp/ffmpeg-master-latest-win64-gpl" "$ASSETS_DIR/ffmpeg"
    rmdir "$DOWNLOAD_DIR/ffmpeg-tmp"
fi
log "ffmpeg (BtbN win64 gpl) pronto em assets/binaries/ffmpeg"

log "Concluído. Checksums registrados em $CHECKSUM_FILE"
cat "$CHECKSUM_FILE"
