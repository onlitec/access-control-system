#!/usr/bin/env bash
# OnliAcesso - empacotamento do instalador Windows 100% NATIVO (Git Bash, sem Docker/WSL).
#
# Pressupostos (ver docs/memoria da maquina de build):
#   - Apps JA compilados nativamente no Windows (backend-api tsc, frontends vite/next).
#   - Inno Setup 6 instalado em %LOCALAPPDATA%\Programs\Inno Setup 6 (winget).
#   - Node v20 empacotado em windows/assets/binaries/node (usado no npm install do
#     staging do backend: o pacote nativo `canvas` escolhe o prebuild pela ABI do
#     node que EXECUTA o npm install — o Node 24 do host pediria node-v137, que
#     nao existe, e cairia num build MSBuild sem headers GTK/cairo).
#
# Armadilhas Git Bash tratadas aqui:
#   - Paths POSIX (/e/...) quebram .exe nativos → converter com `cygpath -m`.
#   - Argumentos comecando com "/" (ex.: /DAppVersion=) sofrem auto-conversao de
#     path do MSYS → MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" na chamada do ISCC.
#
# Uso: cd installer && bash build-package-windows-native.sh
set -euo pipefail

INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$INSTALLER_DIR")"

# Cache do npm no MESMO disco do projeto (E:): o default fica em C:\Users\...,
# que já lotou o disco do sistema durante um build (ENOSPC).
export npm_config_cache="$(cygpath -m "$INSTALLER_DIR/.npm-cache")"
WIN_DIR="$INSTALLER_DIR/windows"
BINARIES_DIR="$WIN_DIR/assets/binaries"
STAGE_DIR="$WIN_DIR/stage"
DIST_DIR="$INSTALLER_DIR/dist"

BUNDLED_NODE_DIR="$BINARIES_DIR/node"
ISCC_EXE="$LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe"

log() { echo; echo "==> $*"; }

[ -f "$ISCC_EXE" ] || { echo "ERRO: ISCC.exe nao encontrado em $ISCC_EXE"; exit 1; }
[ -f "$BUNDLED_NODE_DIR/node.exe" ] || { echo "ERRO: Node empacotado ausente em $BUNDLED_NODE_DIR"; exit 1; }

ROOT_DIR_WIN="$(cygpath -m "$ROOT_DIR")"
VERSION=$(node -p "require('$ROOT_DIR_WIN/package.json').version")
log "Versao do pacote (package.json raiz): $VERSION"

for bin in node pgsql nginx ffmpeg winsw; do
    [ -d "$BINARIES_DIR/$bin" ] || { echo "ERRO: binario '$bin' ausente. Rode windows/scripts/download-binaries.sh antes."; exit 1; }
done

# Binários VMS são opcionais: se ausentes o [Components] VMS fica cinza/unchecked
VMS_AVAILABLE=0
if [ -d "$BINARIES_DIR/mediamtx" ] && [ -d "$BINARIES_DIR/rclone" ]; then
    VMS_AVAILABLE=1
    log "MediaMTX e rclone encontrados — componente VMS disponível no instalador."
else
    log "AVISO: MediaMTX e/ou rclone ausentes — componente VMS desabilitado no instalador. Rode download-binaries.sh para incluí-los."
fi

# ------------------------------------------------- 1. Builds (JA FEITOS) ---
log "Validando builds nativos existentes..."
[ -d "$ROOT_DIR/backend-api/dist" ] || { echo "ERRO: backend-api/dist ausente (rode npm run build)"; exit 1; }
[ -f "$ROOT_DIR/frontend-visitor/.next/standalone/frontend-visitor/server.js" ] || {
    echo "ERRO: .next/standalone nao gerado (confira output: 'standalone' no next.config.ts)"; exit 1; }
[ -d "$ROOT_DIR/frontend-access/dist" ] || { echo "ERRO: frontend-access/dist ausente"; exit 1; }
[ -d "$ROOT_DIR/frontend-admin/dist" ] || { echo "ERRO: frontend-admin/dist ausente"; exit 1; }

# ------------------------------------------------------------ 2. Staging ---
log "Montando staging em $STAGE_DIR ..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"/{binaries,apps,services,scripts}

# Binarios (hardlinks: mesmo filesystem, copia instantanea)
for bin in node pgsql nginx ffmpeg winsw; do
    cp -al "$BINARIES_DIR/$bin" "$STAGE_DIR/binaries/$bin"
done
# nginx.conf customizado sobrepoe o padrao
cp "$WIN_DIR/assets/nginx/nginx.conf" "$STAGE_DIR/binaries/nginx/conf/nginx.conf"

# Binarios VMS (copiados apenas se disponíveis)
if [ $VMS_AVAILABLE -eq 1 ]; then
    cp -al "$BINARIES_DIR/mediamtx" "$STAGE_DIR/binaries/mediamtx"
    cp -al "$BINARIES_DIR/rclone"   "$STAGE_DIR/binaries/rclone"
    # mediamtx.yml base (preservado em upgrade pelo install.ps1)
    mkdir -p "$STAGE_DIR/config"
    cp "$WIN_DIR/assets/mediamtx/mediamtx.yml" "$STAGE_DIR/config/mediamtx.yml"
    log "Binários VMS copiados para o staging."
fi

# Servicos WinSW e scripts
cp "$WIN_DIR/assets/services/"*.xml "$STAGE_DIR/services/"
cp "$WIN_DIR/scripts/"*.ps1 "$STAGE_DIR/scripts/"
# smtp-defaults.env: gitignored (segredo real), so empacota se existir localmente
[ -f "$WIN_DIR/scripts/smtp-defaults.env" ] && cp "$WIN_DIR/scripts/smtp-defaults.env" "$STAGE_DIR/scripts/"

# ---- backend-api: dist + prisma + node_modules de producao (Windows nativo)
log "Staging do backend-api (npm install com o Node v20 EMPACOTADO)..."
BACKEND_STAGE="$STAGE_DIR/apps/backend-api"
mkdir -p "$BACKEND_STAGE"
cp -r "$ROOT_DIR/backend-api/dist" "$BACKEND_STAGE/dist"
mkdir -p "$BACKEND_STAGE/prisma"
cp "$ROOT_DIR/backend-api/prisma/schema.prisma" "$BACKEND_STAGE/prisma/"
cp -r "$ROOT_DIR/backend-api/prisma/migrations" "$BACKEND_STAGE/prisma/migrations"

# package.json de staging: prisma (CLI) vira dependencia de producao,
# para o `prisma migrate deploy` funcionar na maquina de destino
node - "$(cygpath -m "$ROOT_DIR/backend-api/package.json")" "$(cygpath -m "$BACKEND_STAGE/package.json")" <<'EOF'
const fs = require('fs');
const [src, dest] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(src, 'utf8'));
pkg.dependencies.prisma = pkg.devDependencies.prisma;
delete pkg.devDependencies;
delete pkg.scripts;
fs.writeFileSync(dest, JSON.stringify(pkg, null, 2));
EOF

# npm install com o node EMPACOTADO na frente do PATH: o `canvas` escolhe o
# prebuild pela ABI do node em execucao (v20 → node-v115, existe no CDN).
(cd "$BACKEND_STAGE" && \
    PATH="$BUNDLED_NODE_DIR:$PATH" \
    PRISMA_CLI_BINARY_TARGETS="native,windows" \
    "$BUNDLED_NODE_DIR/npm.cmd" install --omit=dev --no-audit --no-fund --loglevel=error)

log "Gerando Prisma Client (binaryTargets: native + windows)..."
(cd "$BACKEND_STAGE" && PATH="$BUNDLED_NODE_DIR:$PATH" "$BUNDLED_NODE_DIR/npx.cmd" prisma generate --schema prisma/schema.prisma)

# valida presenca dos engines Windows (no build nativo o proprio npm install ja
# baixa os engines win32; schema-engine vem como .exe do @prisma/engines)
find "$BACKEND_STAGE/node_modules" -name "query_engine-windows.dll.node" | grep -q . || {
    echo "ERRO: query engine do Prisma para Windows nao encontrado no staging"; exit 1; }
find "$BACKEND_STAGE/node_modules/@prisma/engines" -iname "schema-engine*.exe" | grep -q . || {
    echo "ERRO: schema engine do Prisma para Windows nao encontrado (migrate deploy falharia)"; exit 1; }

# valida que o canvas.node empacotado e PE (Windows), nao ELF (Linux)
CANVAS_NODE=$(find "$BACKEND_STAGE/node_modules/canvas" -name "canvas.node" | head -1)
if [ -n "$CANVAS_NODE" ]; then
    head -c 2 "$CANVAS_NODE" | grep -q "MZ" || { echo "ERRO: canvas.node nao e binario Windows (PE)"; exit 1; }
    echo "    canvas.node OK (binario Windows)"
fi

# ---- frontend-visitor: Next standalone + static + public
log "Staging do frontend-visitor (Next standalone)..."
VISITOR_SRC="$ROOT_DIR/frontend-visitor"
VISITOR_STAGE="$STAGE_DIR/apps/frontend-visitor"
mkdir -p "$VISITOR_STAGE"
cp -r "$VISITOR_SRC/.next/standalone/." "$VISITOR_STAGE/"
mkdir -p "$VISITOR_STAGE/frontend-visitor/.next"
cp -r "$VISITOR_SRC/.next/static" "$VISITOR_STAGE/frontend-visitor/.next/static"
[ -d "$VISITOR_SRC/public" ] && cp -r "$VISITOR_SRC/public" "$VISITOR_STAGE/frontend-visitor/public"

# ---- frontends estaticos
log "Staging dos frontends estaticos..."
mkdir -p "$STAGE_DIR/apps/frontend-access" "$STAGE_DIR/apps/frontend-admin"
cp -r "$ROOT_DIR/frontend-access/dist" "$STAGE_DIR/apps/frontend-access/dist"
cp -r "$ROOT_DIR/frontend-admin/dist" "$STAGE_DIR/apps/frontend-admin/dist"
cp "$WIN_DIR/assets/serve-static.js" "$STAGE_DIR/apps/serve-static.js"

log "Tamanho do staging:"
du -sh "$STAGE_DIR"/* | sed 's/^/    /'

# --------------------------------------------------- 3. Compilar o setup ---
log "Compilando OnliAcesso.iss (ISCC nativo, LZMA2 maximo — demora)..."
mkdir -p "$DIST_DIR"
ISS_WIN="$(cygpath -m "$WIN_DIR/OnliAcesso.iss")"
(cd "$INSTALLER_DIR" && \
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" \
    "$ISCC_EXE" "/DAppVersion=$VERSION" "/DVmsAvailable=$VMS_AVAILABLE" "$ISS_WIN")

SETUP_EXE=$(ls -t "$DIST_DIR"/OnliAcessoSetup-*.exe 2>/dev/null | head -1)
[ -n "$SETUP_EXE" ] || { echo "ERRO: instalador nao gerado em $DIST_DIR"; exit 1; }

log "Instalador gerado:"
ls -lh "$SETUP_EXE" | sed 's/^/    /'
log "SHA256:"
sha256sum "$SETUP_EXE" | tee "$SETUP_EXE.sha256" | sed 's/^/    /'

log "Concluido."
