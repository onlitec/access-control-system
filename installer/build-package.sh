#!/usr/bin/env bash
# OnliAcesso - empacotamento do instalador Windows.
# Uso: cd installer && bash build-package.sh
# Requisitos: node/npm, docker (imagem amake/innosetup), binários já baixados
# via windows/scripts/download-binaries.sh.
set -euo pipefail

INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$INSTALLER_DIR")"
WIN_DIR="$INSTALLER_DIR/windows"
BINARIES_DIR="$WIN_DIR/assets/binaries"
STAGE_DIR="$WIN_DIR/stage"
DIST_DIR="$INSTALLER_DIR/dist"

log() { echo; echo "==> $*"; }

VERSION=$(node -p "require('$ROOT_DIR/package.json').version")
log "Versão do pacote (package.json raiz): $VERSION"

for bin in node pgsql nginx ffmpeg winsw; do
    [ -d "$BINARIES_DIR/$bin" ] || { echo "ERRO: binário '$bin' ausente. Rode windows/scripts/download-binaries.sh antes."; exit 1; }
done

# ------------------------------------------------------------- 1. Builds ---
log "Compilando backend-api (tsc)..."
(cd "$ROOT_DIR/backend-api" && npx tsc)

log "Compilando frontend-visitor (next build)..."
(cd "$ROOT_DIR/frontend-visitor" && npx next build)

log "Compilando frontend-access (vite build)..."
(cd "$ROOT_DIR/frontend-access" && npm run build)

log "Compilando frontend-admin (vite build)..."
(cd "$ROOT_DIR/frontend-admin" && npm run build)

[ -f "$ROOT_DIR/frontend-visitor/.next/standalone/frontend-visitor/server.js" ] || {
    echo "ERRO: .next/standalone não gerado (confira output: 'standalone' no next.config.ts)"; exit 1; }

# ------------------------------------------------------------ 2. Staging ---
log "Montando staging em $STAGE_DIR ..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"/{binaries,apps,services,scripts}

# Binários (hardlinks: mesmo filesystem, cópia instantânea)
for bin in node pgsql nginx ffmpeg winsw; do
    cp -al "$BINARIES_DIR/$bin" "$STAGE_DIR/binaries/$bin"
done
# nginx.conf customizado sobrepõe o padrão
cp "$WIN_DIR/assets/nginx/nginx.conf" "$STAGE_DIR/binaries/nginx/conf/nginx.conf"

# Serviços WinSW e scripts
cp "$WIN_DIR/assets/services/"*.xml "$STAGE_DIR/services/"
cp "$WIN_DIR/scripts/"*.ps1 "$STAGE_DIR/scripts/"
# smtp-defaults.env: gitignored (segredo real), só empacota se existir localmente
[ -f "$WIN_DIR/scripts/smtp-defaults.env" ] && cp "$WIN_DIR/scripts/smtp-defaults.env" "$STAGE_DIR/scripts/"

# ---- backend-api: dist + prisma + node_modules de produção (alvo Windows)
log "Staging do backend-api (npm install de produção + engines Prisma p/ Windows)..."
BACKEND_STAGE="$STAGE_DIR/apps/backend-api"
mkdir -p "$BACKEND_STAGE"
cp -r "$ROOT_DIR/backend-api/dist" "$BACKEND_STAGE/dist"
mkdir -p "$BACKEND_STAGE/prisma"
cp "$ROOT_DIR/backend-api/prisma/schema.prisma" "$BACKEND_STAGE/prisma/"
cp -r "$ROOT_DIR/backend-api/prisma/migrations" "$BACKEND_STAGE/prisma/migrations"

# package.json de staging: prisma (CLI) vira dependência de produção,
# para o `prisma migrate deploy` funcionar na máquina de destino
node - "$ROOT_DIR/backend-api/package.json" "$BACKEND_STAGE/package.json" <<'EOF'
const fs = require('fs');
const [src, dest] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(src, 'utf8'));
pkg.dependencies.prisma = pkg.devDependencies.prisma;
delete pkg.devDependencies;
delete pkg.scripts;
fs.writeFileSync(dest, JSON.stringify(pkg, null, 2));
EOF


# npm_config_target_* força o node-pre-gyp/prebuild-install do pacote `canvas`
# (dependência nativa do FaceMatchService) a baixar o prebuilt do Windows
# mesmo rodando este `npm install` sob WSL/Linux - sem isso, o binário
# instalado é um .node ELF (Linux), que não carrega no node.exe Windows
# empacotado, quebrando a verificação facial silenciosamente em produção.
(cd "$BACKEND_STAGE" && \
    PRISMA_CLI_BINARY_TARGETS="native,windows" \
    npm_config_target_platform=win32 \
    npm_config_target_arch=x64 \
    npm_config_target_libc=unknown \
    npm install --omit=dev --no-audit --no-fund --loglevel=error)

log "Gerando Prisma Client (binaryTargets: native + windows)..."
(cd "$BACKEND_STAGE" && npx prisma generate --schema prisma/schema.prisma)

# O postinstall do @prisma/engines só baixa o schema engine da plataforma
# atual (Linux); o `prisma migrate deploy` no Windows precisa do
# schema-engine-windows.exe — baixamos do CDN oficial do Prisma.
log "Baixando schema engine do Prisma para Windows..."
ENGINES_COMMIT=$(cd "$BACKEND_STAGE" && node -p "require('@prisma/engines-version').enginesVersion")
SCHEMA_ENGINE_URL="https://binaries.prisma.sh/all_commits/$ENGINES_COMMIT/windows/schema-engine.exe.gz"
SCHEMA_ENGINE_DEST="$BACKEND_STAGE/node_modules/@prisma/engines/schema-engine-windows.exe"
SCHEMA_ENGINE_GZ="$(mktemp)"
curl -fsSL --retry 3 -o "$SCHEMA_ENGINE_GZ" "$SCHEMA_ENGINE_URL"
EXPECTED_SHA=$(curl -fsSL --retry 3 "$SCHEMA_ENGINE_URL.sha256" | awk '{print $1}')
ACTUAL_SHA=$(sha256sum "$SCHEMA_ENGINE_GZ" | awk '{print $1}')
if [ -n "$EXPECTED_SHA" ] && [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
    echo "ERRO: SHA256 do schema-engine windows divergente"; exit 1
fi
gunzip -c "$SCHEMA_ENGINE_GZ" > "$SCHEMA_ENGINE_DEST"
rm -f "$SCHEMA_ENGINE_GZ"
echo "    schema-engine-windows.exe OK (commit $ENGINES_COMMIT, SHA256 $ACTUAL_SHA)"

# valida presença dos engines Windows
find "$BACKEND_STAGE/node_modules" -name "*windows*" | grep -q "query_engine-windows.dll.node" || {
    echo "ERRO: query engine do Prisma para Windows não encontrado no staging"; exit 1; }
find "$BACKEND_STAGE/node_modules/@prisma/engines" -name "schema-engine-windows.exe" | grep -q . || {
    echo "ERRO: schema engine do Prisma para Windows não encontrado (migrate deploy falharia)"; exit 1; }

# ---- frontend-visitor: Next standalone + static + public
log "Staging do frontend-visitor (Next standalone)..."
VISITOR_SRC="$ROOT_DIR/frontend-visitor"
VISITOR_STAGE="$STAGE_DIR/apps/frontend-visitor"
mkdir -p "$VISITOR_STAGE"
cp -r "$VISITOR_SRC/.next/standalone/." "$VISITOR_STAGE/"
mkdir -p "$VISITOR_STAGE/frontend-visitor/.next"
cp -r "$VISITOR_SRC/.next/static" "$VISITOR_STAGE/frontend-visitor/.next/static"
[ -d "$VISITOR_SRC/public" ] && cp -r "$VISITOR_SRC/public" "$VISITOR_STAGE/frontend-visitor/public"

# ---- frontends estáticos
log "Staging dos frontends estáticos..."
mkdir -p "$STAGE_DIR/apps/frontend-access" "$STAGE_DIR/apps/frontend-admin"
cp -r "$ROOT_DIR/frontend-access/dist" "$STAGE_DIR/apps/frontend-access/dist"
cp -r "$ROOT_DIR/frontend-admin/dist" "$STAGE_DIR/apps/frontend-admin/dist"
cp "$WIN_DIR/assets/serve-static.js" "$STAGE_DIR/apps/serve-static.js"

log "Tamanho do staging:"
du -sh "$STAGE_DIR"/* | sed 's/^/    /'

# --------------------------------------------------- 3. Compilar o setup ---
log "Compilando OnliAcesso.iss (Inno Setup via docker/wine, LZMA2 máximo — demora)..."
mkdir -p "$DIST_DIR"
docker run --rm \
    -v "$INSTALLER_DIR":/work \
    amake/innosetup:latest \
    "/DAppVersion=$VERSION" "windows/OnliAcesso.iss"

SETUP_EXE=$(ls -t "$DIST_DIR"/OnliAcessoSetup-*.exe 2>/dev/null | head -1)
[ -n "$SETUP_EXE" ] || { echo "ERRO: instalador não gerado em $DIST_DIR"; exit 1; }

log "Instalador gerado:"
ls -lh "$SETUP_EXE" | sed 's/^/    /'
log "SHA256:"
sha256sum "$SETUP_EXE" | tee "$SETUP_EXE.sha256" | sed 's/^/    /'

log "Concluído."
