#!/usr/bin/env bash
# OnliAcesso — empacota o sistema para instalação no Linux.
#
# Gera installer/dist/onliacesso-linux-<versao>.tar.gz contendo os apps já
# compilados, as units systemd, o nginx.conf, o mediamtx.yml e os scripts.
#
# Roda tanto no Linux quanto no Windows (Git Bash): o pacote NÃO leva
# node_modules — as dependências nativas (canvas, engines do Prisma) precisam
# ser compiladas/baixadas para o Linux, e é o install.sh que faz isso no
# servidor de destino (por isso ele exige internet).
#
# Uso:  cd installer/linux && bash build-package-linux.sh
set -euo pipefail

LINUX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$LINUX_DIR/../.." && pwd)"
DIST_DIR="$ROOT_DIR/installer/dist"

log() { echo -e "\n==> $*"; }
die() { echo "ERRO: $*" >&2; exit 1; }

# Lido com sed em vez de `node -p require(...)`: no Git Bash o caminho POSIX
# (/e/...) não resolve para o node do Windows, e a versão saía como 0.0.0.
VERSION="$(sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$ROOT_DIR/package.json" | head -1)"
[ -n "$VERSION" ] || die "Não consegui ler a versão de package.json"
log "Empacotando OnliAcesso $VERSION para Linux"

# ── Builds necessários ────────────────────────────────────────────────────────
[ -d "$ROOT_DIR/backend-api/dist" ]      || die "backend-api/dist ausente (npm run build)"
[ -d "$ROOT_DIR/frontend-access/dist" ]  || die "frontend-access/dist ausente (npm run build)"
[ -d "$ROOT_DIR/frontend-admin/dist" ]   || die "frontend-admin/dist ausente (npm run build)"
[ -f "$ROOT_DIR/frontend-visitor/.next/standalone/frontend-visitor/server.js" ] \
    || die "frontend-visitor não compilado em standalone (npm run build)"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
PKG="$STAGE/onliacesso-linux-$VERSION"
mkdir -p "$PKG"/{apps,systemd,nginx,mediamtx}

# ── backend-api: dist + prisma + package.json ─────────────────────────────────
log "backend-api..."
mkdir -p "$PKG/apps/backend-api/prisma"
cp -r "$ROOT_DIR/backend-api/dist" "$PKG/apps/backend-api/dist"
cp "$ROOT_DIR/backend-api/prisma/schema.prisma" "$PKG/apps/backend-api/prisma/"
cp -r "$ROOT_DIR/backend-api/prisma/migrations" "$PKG/apps/backend-api/prisma/migrations"

# package.json de produção: o CLI do prisma vira dependência normal (o install.sh
# roda `prisma migrate deploy` no servidor) e os scripts saem do caminho
node - "$ROOT_DIR/backend-api/package.json" "$PKG/apps/backend-api/package.json" <<'EOF'
const fs = require('fs');
const [src, dest] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(src, 'utf8'));
pkg.dependencies.prisma = pkg.devDependencies.prisma;
delete pkg.devDependencies;
delete pkg.scripts;
fs.writeFileSync(dest, JSON.stringify(pkg, null, 2));
EOF

# ── frontend-visitor: Next standalone ─────────────────────────────────────────
log "frontend-visitor (Next standalone)..."
VIS="$PKG/apps/frontend-visitor"
mkdir -p "$VIS/frontend-visitor/.next"
cp -r "$ROOT_DIR/frontend-visitor/.next/standalone/." "$VIS/"
cp -r "$ROOT_DIR/frontend-visitor/.next/static" "$VIS/frontend-visitor/.next/static"
[ -d "$ROOT_DIR/frontend-visitor/public" ] && cp -r "$ROOT_DIR/frontend-visitor/public" "$VIS/frontend-visitor/public"

# ── SPAs (servidos pelo próprio nginx no Linux) ───────────────────────────────
log "frontend-access e frontend-admin..."
mkdir -p "$PKG/apps/frontend-access" "$PKG/apps/frontend-admin"
cp -r "$ROOT_DIR/frontend-access/dist" "$PKG/apps/frontend-access/dist"
cp -r "$ROOT_DIR/frontend-admin/dist"  "$PKG/apps/frontend-admin/dist"

# ── Scripts e configuração ────────────────────────────────────────────────────
log "scripts, systemd e configs..."
cp "$LINUX_DIR"/install.sh "$LINUX_DIR"/uninstall.sh "$LINUX_DIR"/enable-cloud-access.sh "$PKG/"
cp "$LINUX_DIR"/README.md "$PKG/" 2>/dev/null || true
cp "$LINUX_DIR"/systemd/*.service "$PKG/systemd/"
cp "$LINUX_DIR"/nginx/onliacesso.conf "$PKG/nginx/"
cp "$LINUX_DIR"/mediamtx/mediamtx.yml "$PKG/mediamtx/"
chmod +x "$PKG"/*.sh

# smtp-defaults.env é segredo (gitignored): só entra se existir localmente
if [ -f "$ROOT_DIR/installer/windows/scripts/smtp-defaults.env" ]; then
    cp "$ROOT_DIR/installer/windows/scripts/smtp-defaults.env" "$PKG/"
    log "smtp-defaults.env incluído (e-mail sai configurado)."
else
    echo "    AVISO: smtp-defaults.env ausente — o SMTP terá de ser configurado no Admin."
fi

# ── Tarball ───────────────────────────────────────────────────────────────────
mkdir -p "$DIST_DIR"
TARBALL="$DIST_DIR/onliacesso-linux-$VERSION.tar.gz"
tar -czf "$TARBALL" -C "$STAGE" "onliacesso-linux-$VERSION"

log "Pacote gerado:"
ls -lh "$TARBALL" | sed 's/^/    /'
sha256sum "$TARBALL" | tee "$TARBALL.sha256" | sed 's/^/    /'

cat <<EOF

Para instalar no servidor Linux:

    scp $(basename "$TARBALL") usuario@servidor:/tmp/
    ssh usuario@servidor
    tar -xzf /tmp/$(basename "$TARBALL") -C /tmp
    cd /tmp/onliacesso-linux-$VERSION
    sudo ./install.sh

EOF
