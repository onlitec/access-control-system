#!/usr/bin/env bash
# OnliAcesso — desinstalação (Linux).
#
#   sudo ./uninstall.sh              # remove serviços e aplicação; PRESERVA banco e gravações
#   sudo ./uninstall.sh --purge      # remove TAMBÉM o banco, as gravações e a configuração
set -euo pipefail

APP_DIR="/opt/onliacesso"
APP_USER="onliacesso"
DB_NAME="onliacesso"
DB_USER="onliacesso"
PURGE=0

[ "${1:-}" = "--purge" ] && PURGE=1

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m[!]\033[0m $*"; }

[ "$EUID" -eq 0 ] || { echo "Execute como root: sudo ./uninstall.sh"; exit 1; }

if [ "$PURGE" -eq 1 ]; then
    warn "MODO PURGE: o banco de dados e TODAS as gravações serão APAGADOS."
    read -rp "Digite 'APAGAR TUDO' para confirmar: " confirm
    [ "$confirm" = "APAGAR TUDO" ] || { echo "Cancelado."; exit 1; }
fi

log "Parando e removendo serviços..."
for svc in onliacesso-vms onliacesso-mediamtx onliacesso-visitor onliacesso-api; do
    systemctl disable --now "$svc" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$svc.service"
done
systemctl daemon-reload

rm -f /etc/sudoers.d/onliacesso

log "Removendo a configuração do nginx..."
rm -f /etc/nginx/sites-enabled/onliacesso /etc/nginx/sites-available/onliacesso
systemctl reload nginx 2>/dev/null || true

if command -v ufw >/dev/null; then
    ufw delete allow 8189/udp >/dev/null 2>&1 || true
    warn "A porta 80/tcp foi mantida no firewall (outros serviços podem usá-la)."
fi

if [ "$PURGE" -eq 1 ]; then
    log "Apagando banco de dados..."
    sudo -u postgres psql -qc "DROP DATABASE IF EXISTS $DB_NAME;" || true
    sudo -u postgres psql -qc "DROP USER IF EXISTS $DB_USER;" || true

    log "Apagando $APP_DIR (aplicação, gravações e configuração)..."
    rm -rf "$APP_DIR"
    userdel "$APP_USER" 2>/dev/null || true
    echo -e "\n\033[1;32mOnliAcesso removido por completo.\033[0m"
else
    log "Removendo apenas a aplicação..."
    rm -rf "$APP_DIR/apps"
    echo -e "\n\033[1;32mServiços e aplicação removidos.\033[0m"
    echo "Preservados (use --purge para apagar):"
    echo "  · banco de dados '$DB_NAME'"
    echo "  · $APP_DIR/data/recordings  (gravações)"
    echo "  · $APP_DIR/config           (.env, credenciais, rclone)"
fi
