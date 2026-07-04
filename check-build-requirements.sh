#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; FAILS=$((FAILS+1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
info() { echo -e "  ${BLUE}→${NC} $1"; }

FAILS=0

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   OnliAcesso — Verificação de requisitos de build  ${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ─── SISTEMA ────────────────────────────────────────────
echo -e "${BOLD}Sistema operacional${NC}"

OS=$(lsb_release -si 2>/dev/null || echo "unknown")
VER=$(lsb_release -sr 2>/dev/null || echo "?")
ARCH=$(uname -m)

if [[ "$OS" == "Ubuntu" ]]; then
  ok "Ubuntu $VER detectado ($ARCH)"
else
  warn "Sistema: $OS $VER — testado apenas em Ubuntu"
fi

if [[ "$ARCH" == "x86_64" ]]; then
  ok "Arquitetura x86_64"
else
  fail "Arquitetura $ARCH não suportada (necessário x86_64)"
fi

# i386 necessário para Wine 32-bit
if dpkg --print-foreign-architectures 2>/dev/null | grep -q i386; then
  ok "Arquitetura i386 habilitada (Wine)"
else
  warn "Arquitetura i386 não habilitada — necessária para Wine"
  info "Corrigir: sudo dpkg --add-architecture i386 && sudo apt update"
fi

echo ""

# ─── MEMÓRIA E DISCO ────────────────────────────────────
echo -e "${BOLD}Recursos do sistema${NC}"

RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
RAM_GB=$(echo "scale=1; $RAM_KB/1024/1024" | bc)
if (( RAM_KB >= 3145728 )); then
  ok "RAM: ${RAM_GB} GB (mínimo 3 GB)"
else
  fail "RAM: ${RAM_GB} GB insuficiente — mínimo 3 GB para compilar Next.js"
fi

DISK_FREE=$(df -BG / | awk 'NR==2 {gsub("G",""); print $4}')
if (( DISK_FREE >= 10 )); then
  ok "Espaço livre: ${DISK_FREE} GB (mínimo 10 GB)"
else
  fail "Espaço livre: ${DISK_FREE} GB insuficiente — mínimo 10 GB"
  info "Necessário: ~2 GB binários Windows + ~3 GB build Next.js + ~2 GB .exe final"
fi

echo ""

# ─── NODE.JS ─────────────────────────────────────────────
echo -e "${BOLD}Node.js${NC}"

if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  NODE_MAJOR=$(node --version | cut -d. -f1 | tr -d 'v')
  if (( NODE_MAJOR >= 20 )); then
    ok "Node.js $NODE_VER"
  else
    fail "Node.js $NODE_VER — necessário v20 ou superior"
    info "Corrigir: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  fi
else
  fail "Node.js não encontrado"
  info "Instalar: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
fi

if command -v npm &>/dev/null; then
  ok "npm $(npm --version)"
else
  fail "npm não encontrado"
fi

echo ""

# ─── WINE ────────────────────────────────────────────────
echo -e "${BOLD}Wine (necessário para gerar o .exe com Inno Setup)${NC}"

if command -v wine &>/dev/null; then
  WINE_VER=$(wine --version 2>/dev/null)
  ok "Wine: $WINE_VER"
else
  fail "Wine não encontrado"
  info "Instalar: sudo apt install -y wine wine32 wine64"
fi

if command -v wine64 &>/dev/null; then
  ok "Wine64 disponível"
else
  warn "Wine64 não encontrado"
  info "Instalar: sudo apt install -y wine64"
fi

# Verifica se Inno Setup está instalado no Wine
ISCC_PATH="$HOME/.wine/drive_c/Program Files (x86)/Inno Setup 6/ISCC.exe"
if [[ -f "$ISCC_PATH" ]]; then
  ok "Inno Setup 6 instalado no Wine"
else
  warn "Inno Setup 6 não encontrado no Wine"
  info "Instalar: wget https://jrsoftware.org/download.php/is.exe -O /tmp/is.exe && wine /tmp/is.exe /VERYSILENT"
fi

echo ""

# ─── FERRAMENTAS AUXILIARES ──────────────────────────────
echo -e "${BOLD}Ferramentas auxiliares${NC}"

for tool in wget curl zip unzip jq bc git; do
  if command -v $tool &>/dev/null; then
    ok "$tool $(${tool} --version 2>/dev/null | head -1 | awk '{print $NF}')"
  else
    fail "$tool não encontrado"
    info "Instalar: sudo apt install -y $tool"
  fi
done

echo ""

# ─── MONOREPO ────────────────────────────────────────────
echo -e "${BOLD}Monorepo access-control-system${NC}"

if [[ -f "package.json" ]]; then
  ok "package.json encontrado (você está na raiz do projeto)"

  # Verifica workspaces
  for ws in backend-api frontend-visitor frontend-access frontend-admin; do
    if [[ -d "$ws" ]]; then
      ok "Workspace: $ws"
    else
      fail "Workspace não encontrado: $ws"
    fi
  done

  # Verifica next.config em cada frontend
  for ws in frontend-visitor frontend-access frontend-admin; do
    CFG=$(ls $ws/next.config.* 2>/dev/null | head -1)
    if [[ -n "$CFG" ]]; then
      if grep -q "standalone" "$CFG" 2>/dev/null; then
        ok "$ws: output standalone configurado"
      else
        warn "$ws: output standalone NÃO configurado em $CFG"
        info "Adicionar: output: 'standalone' no next.config"
      fi
    else
      warn "$ws: next.config não encontrado"
    fi
  done

  # Verifica node_modules
  if [[ -d "node_modules" ]]; then
    ok "node_modules instalado (npm install já executado)"
  else
    warn "node_modules não encontrado"
    info "Executar: npm install"
  fi

else
  warn "package.json não encontrado neste diretório"
  info "Execute este script na raiz do monorepo access-control-system"
fi

echo ""

# ─── CONECTIVIDADE ───────────────────────────────────────
echo -e "${BOLD}Conectividade (downloads de binários Windows)${NC}"

for url in \
  "nodejs.org:Node.js Windows binaries" \
  "get.enterprisedb.com:PostgreSQL Windows" \
  "nginx.org:Nginx Windows" \
  "github.com:WinSW releases"; do
  HOST="${url%%:*}"
  DESC="${url##*:}"
  if curl -s --connect-timeout 5 --max-time 8 "https://$HOST" -o /dev/null 2>/dev/null; then
    ok "$DESC ($HOST)"
  else
    fail "$DESC ($HOST) — sem acesso"
    info "Necessário para baixar binários durante o build"
  fi
done

echo ""

# ─── RESUMO ──────────────────────────────────────────────
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
if (( FAILS == 0 )); then
  echo -e "  ${GREEN}${BOLD}✓ Ambiente pronto para gerar o pacote${NC}"
else
  echo -e "  ${RED}${BOLD}✗ $FAILS problema(s) encontrado(s) — corrija antes de prosseguir${NC}"
fi
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
