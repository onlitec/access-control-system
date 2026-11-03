#!/usr/bin/env bash
# Monta o pacote do Módulo do Morador e (sem --stage-only) compila o instalador .exe
# via Docker (amake/innosetup). Uso: bash build-package.sh [--stage-only]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOD="$(dirname "$HERE")"
STAGE="$HERE/stage"
BIN="$HERE/assets/binaries"
log() { echo; echo "==> $*"; }

VERSION=$(node -p "require('$MOD/package.json').version")
[ -d "$BIN/node" ] && [ -f "$BIN/winsw/WinSW-x64.exe" ] || bash "$HERE/download-binaries.sh"

log "Compilando (prisma generate + tsc)..."
(cd "$MOD" && npx prisma generate >/dev/null && rm -rf dist && npx tsc)

log "Montando staging em $STAGE ..."
rm -rf "$STAGE"
mkdir -p "$STAGE/app" "$STAGE/scripts"
cp -r "$BIN/node" "$STAGE/node"
cp "$BIN/winsw/WinSW-x64.exe" "$STAGE/ModuloMorador.exe"
cp "$HERE/assets/ModuloMorador.xml" "$STAGE/ModuloMorador.xml"
cp "$HERE/scripts/"*.ps1 "$STAGE/scripts/"
cp -r "$MOD/dist" "$MOD/public" "$MOD/migrations" "$STAGE/app/"
cp "$MOD/.env.example" "$STAGE/app/.env.example"

# node_modules só de produção; o Prisma Client gerado aqui já traz o motor do Windows
# (binaryTargets = native + windows), então a CLI do Prisma não vai para o servidor.
node - "$MOD/package.json" "$STAGE/app/package.json" <<'JS'
const fs = require('fs');
const [src, dest] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(src, 'utf8'));
delete pkg.devDependencies; delete pkg.scripts;
fs.writeFileSync(dest, JSON.stringify(pkg, null, 2));
JS
cp "$MOD/package-lock.json" "$STAGE/app/"
(cd "$STAGE/app" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
rm -rf "$STAGE/app/node_modules/.prisma"
cp -r "$MOD/node_modules/.prisma" "$STAGE/app/node_modules/.prisma"

find "$STAGE/app/node_modules/.prisma/client" -name "query_engine-windows.dll.node" | grep -q . || {
    echo "ERRO: motor do Prisma para Windows ausente no staging"; exit 1; }
[ -f "$STAGE/app/dist/server.js" ] && [ -f "$STAGE/app/migrations/001_init.sql" ] || { echo "ERRO: staging incompleto"; exit 1; }
du -sh "$STAGE"/* | sed 's/^/    /'

[ "${1:-}" = "--stage-only" ] && { log "Staging pronto (compilação do instalador ignorada)."; exit 0; }

log "Compilando ModuloMorador.iss (Inno Setup via Docker)..."
mkdir -p "$HERE/dist"
docker run --rm -v "$HERE":/work amake/innosetup:latest "/DAppVersion=$VERSION" "ModuloMorador.iss"
EXE=$(ls -t "$HERE"/dist/ModuloMoradorSetup-*.exe | head -1)
sha256sum "$EXE" | tee "$EXE.sha256"
