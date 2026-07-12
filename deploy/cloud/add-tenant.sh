#!/usr/bin/env bash
# Cadastra (ou re-aponta) um tenant do OnliAcesso Cloud no VPS.
#
# O registry é um map do nginx no volume do Nginx Proxy Manager:
#   /data/nginx/custom/onliacesso-tenants.map   (slug → IP Tailscale)
# incluído por /data/nginx/custom/http_top.conf (ver npm-http-top.conf).
#
# Uso:
#   bash deploy/cloud/add-tenant.sh <slug> <host>   # host = nome MagicDNS OU IP 100.x
#   bash deploy/cloud/add-tenant.sh --list
#
# Exemplos:
#   bash deploy/cloud/add-tenant.sh onlitec onli-acesso
#   bash deploy/cloud/add-tenant.sh galvatec 100.77.220.32
#
# O nome MagicDNS é resolvido para IP NO HOST do VPS (tailscale ip -4) — dentro
# do container do NPM MagicDNS não resolve, por isso o map guarda IPs.
# Reinstalou a máquina do cliente (novo nó na tailnet)? Rode de novo com o nome.
set -euo pipefail

VPS_HOST="${VPS_HOST:-alfreire@10.10.10.1}"
VPS_PORT="${VPS_PORT:-4450}"
NPM_CONTAINER="${NPM_CONTAINER:-nginx-proxy-manager}"
MAP=/data/nginx/custom/onliacesso-tenants.map
HTTP_TOP=/data/nginx/custom/http_top.conf

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

vps() { ssh -p "$VPS_PORT" "$VPS_HOST" "$@"; }
npm_exec() { vps "docker exec $NPM_CONTAINER sh -c '$*'"; }

if [ "${1:-}" = "--list" ]; then
    echo "== Tenants cadastrados =="
    npm_exec "cat $MAP 2>/dev/null" || echo "(registry ainda não existe)"
    exit 0
fi

SLUG="${1:-}"; HOST="${2:-}"
[ -n "$SLUG" ] && [ -n "$HOST" ] || { echo "Uso: add-tenant.sh <slug> <host> | --list"; exit 1; }

# slug: minúsculas/dígitos/hífen, 2-32 chars (mesmo regex das locations do NPM)
if ! echo "$SLUG" | grep -qE '^[a-z0-9-]{2,32}$'; then
    echo "ERRO: slug inválido '$SLUG' (use [a-z0-9-], 2 a 32 caracteres)"; exit 1
fi
case "$SLUG" in
    api|hls|webrtc|t|admin|login|assets)
        echo "ERRO: '$SLUG' é um nome reservado"; exit 1 ;;
esac

# host: IP 100.x direto, ou nome MagicDNS resolvido no host do VPS
if echo "$HOST" | grep -qE '^100\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    IP="$HOST"
else
    echo "==> Resolvendo '$HOST' via MagicDNS no VPS…"
    IP="$(vps "tailscale ip -4 $HOST" | tr -d '\r')"
    echo "$IP" | grep -qE '^100\.' || { echo "ERRO: '$HOST' não resolveu para IP Tailscale (está na tailnet?)"; exit 1; }
fi
echo "==> Tenant '$SLUG' → $IP"

# garante o http_top.conf (map) — primeira execução num VPS limpo
if ! npm_exec "test -f $HTTP_TOP"; then
    echo "==> Criando $HTTP_TOP (map do multi-tenant)"
    vps "docker exec -i $NPM_CONTAINER sh -c 'cat > $HTTP_TOP'" < "$ROOT/deploy/cloud/npm-http-top.conf"
fi

# atualiza o map: backup + remove entrada antiga do slug (idempotente) + apende
npm_exec "touch $MAP && cp $MAP $MAP.bak && grep -vE '^$SLUG ' $MAP.bak > $MAP; echo '$SLUG $IP;' >> $MAP"

# nginx -t ANTES do reload: um map quebrado derruba TODOS os proxy hosts do NPM
if ! npm_exec "nginx -t" >/dev/null 2>&1; then
    echo "ERRO: nginx -t falhou — restaurando o registry anterior (nada foi recarregado)"
    npm_exec "mv $MAP.bak $MAP"
    npm_exec "nginx -t"
    exit 1
fi
npm_exec "rm -f $MAP.bak && nginx -s reload"
echo "==> nginx recarregado"

# smoke test: 400/401 = roteou e o backend do cliente respondeu; 404 = slug não
# entrou no map; 502 = servidor do cliente inalcançável (tailscale/firewall)
CODE=$(curl -s -o /dev/null -m 15 -w '%{http_code}' \
    -X POST "https://cloud.onlitec.com.br/t/$SLUG/api/auth/login" \
    -H 'Content-Type: application/json' -d '{}')
case "$CODE" in
    400|401) echo "==> OK: /t/$SLUG/ responde (HTTP $CODE do backend do cliente)" ;;
    404)     echo "ERRO: /t/$SLUG/ deu 404 — o map não foi aplicado?"; exit 1 ;;
    502|504) echo "ERRO: HTTP $CODE — VPS não alcança $IP:3001 (tailscale up? firewall liberou o VPS?)"; exit 1 ;;
    *)       echo "AVISO: resposta inesperada HTTP $CODE — verifique manualmente" ;;
esac
echo "==> Tenant '$SLUG' pronto: https://cloud.onlitec.com.br (código do cliente: $SLUG)"
