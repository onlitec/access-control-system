#!/usr/bin/env bash
# Baixa Node.js (Windows x64) e WinSW para o instalador do Módulo do Morador.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/assets/binaries"
DL="$OUT/.downloads"
mkdir -p "$OUT/winsw" "$DL"

NODE_VERSION="22.22.0"
WINSW_VERSION="3.0.0-alpha.11"
log() { echo "[download-binaries] $*"; }

NODE_ZIP="$DL/node-v${NODE_VERSION}-win-x64.zip"
[ -f "$NODE_ZIP" ] || curl -fL --retry 3 -o "$NODE_ZIP" "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
EXPECTED=$(curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" | awk -v f="node-v${NODE_VERSION}-win-x64.zip" '$2==f {print $1}')
[ -n "$EXPECTED" ] || { log "ERRO: SHA256 publicado do Node não encontrado"; exit 1; }
ACTUAL=$(sha256sum "$NODE_ZIP" | awk '{print $1}')
[ "$EXPECTED" = "$ACTUAL" ] || { log "ERRO: SHA256 do Node divergente"; exit 1; }
if [ ! -d "$OUT/node" ]; then
    unzip -q "$NODE_ZIP" -d "$DL/node-tmp"
    mv "$DL/node-tmp/node-v${NODE_VERSION}-win-x64" "$OUT/node"
    rmdir "$DL/node-tmp"
    # npm/corepack não são necessários em produção
    rm -rf "$OUT/node/node_modules" "$OUT/node/npm" "$OUT/node/npm.cmd" "$OUT/node/npx" "$OUT/node/npx.cmd" "$OUT/node/corepack" "$OUT/node/corepack.cmd"
fi
log "Node.js ${NODE_VERSION} verificado (SHA256 $ACTUAL)"

WINSW="$OUT/winsw/WinSW-x64.exe"
[ -f "$WINSW" ] || curl -fL --retry 3 -o "$WINSW" "https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe"
log "WinSW ${WINSW_VERSION} SHA256 $(sha256sum "$WINSW" | awk '{print $1}')"
