#!/usr/bin/env bash
# Publica a PWA (frontend-cloud/) no servidor do cloud.
#
# Desde o cutover de 2026-07-14, cloud.onlitec.com.br sai do RELAY no Brasil
# (192.168.15.36, via Cloudflare Tunnel) — o VPS de Helsinki (10.10.10.1:4450)
# ficou como backup; para publicar lá, sobrescreva VPS_HOST/VPS_PORT.
#
# O deploy sai SEMPRE do repositório — nunca edite os arquivos direto no
# servidor, senão o que está no ar deixa de ser o que está versionado (foi assim
# que o código do app quase se perdeu: existia só no VPS, sem git).
#
# Uso:  bash deploy/cloud/deploy-pwa.sh
set -euo pipefail

VPS_HOST="${VPS_HOST:-alfreire@192.168.15.36}"
VPS_PORT="${VPS_PORT:-22}"
VPS_DIR="${VPS_DIR:-/home/alfreire/docker/apps/onlitec-pwa}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/frontend-cloud"

[ -d "$SRC" ] || { echo "ERRO: frontend-cloud/ não encontrado"; exit 1; }

# não publicar por cima de trabalho não commitado (o que está no ar deve ser
# rastreável a um commit)
if [ -n "$(git -C "$ROOT" status --porcelain -- frontend-cloud 2>/dev/null)" ]; then
    echo "AVISO: há mudanças não commitadas em frontend-cloud/."
    read -r -p "Publicar mesmo assim? [s/N] " ok
    [ "$ok" = "s" ] || exit 1
fi

echo "==> Enviando código para $VPS_HOST:$VPS_DIR"
rsync -az --delete \
    --exclude node_modules --exclude dist --exclude .backup-icons \
    -e "ssh -p $VPS_PORT" \
    "$SRC"/ "$VPS_HOST:$VPS_DIR/"

echo "==> Rebuild do container"
ssh -p "$VPS_PORT" "$VPS_HOST" "cd '$VPS_DIR' && docker compose up -d --build 2>&1 | tail -2"

echo "==> Publicado:"
ssh -p "$VPS_PORT" "$VPS_HOST" "curl -s http://localhost:3050/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'"

COMMIT=$(git -C "$ROOT" rev-parse --short HEAD)
echo "==> No ar: commit $COMMIT — https://cloud.onlitec.com.br"
