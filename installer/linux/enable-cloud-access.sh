#!/usr/bin/env bash
# OnliAcesso — libera o acesso remoto (cloud bridge) para o VPS via Tailscale.
# Equivalente ao enable-cloud-access.ps1 do Windows.
#
# O acesso remoto é opcional e depende do IP do VPS na tailnet, por isso não é
# feito pelo install.sh. Rode apenas no servidor que serve os dados ao
# cloud.onlitec.com.br.
#
#   sudo ./enable-cloud-access.sh 100.90.27.7
#   sudo ./enable-cloud-access.sh 100.90.27.7 --fix-mediamtx-api
set -euo pipefail

VPS_IP="${1:-}"
FIX_API=0
[ "${2:-}" = "--fix-mediamtx-api" ] && FIX_API=1

[ "$EUID" -eq 0 ] || { echo "Execute como root: sudo ./enable-cloud-access.sh <ip-tailscale-do-vps>"; exit 1; }
[ -n "$VPS_IP" ] || { echo "Uso: sudo ./enable-cloud-access.sh <ip-tailscale-do-vps>"; exit 1; }
[[ "$VPS_IP" =~ ^100\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] \
    || { echo "ERRO: '$VPS_IP' não parece um endereço Tailscale (100.x.y.z)."; exit 1; }

command -v ufw >/dev/null || { echo "ERRO: ufw não instalado (apt install ufw)."; exit 1; }

# Portas que o VPS consome do servidor local. Nada aqui vai para a internet: o
# "from $VPS_IP" restringe a origem ao VPS dentro da tailnet.
#   3001 = backend (login + API das câmeras)
#   8888 = MediaMTX HLS (exige ?jwt=)
#   8889 = MediaMTX WebRTC/WHEP (signaling)
for port in 3001 8888 8889; do
    ufw allow from "$VPS_IP" to any port "$port" proto tcp comment "OnliAcesso cloud (VPS)" >/dev/null
    echo "Liberado: TCP $port  ← $VPS_IP"
done

if [ "$FIX_API" -eq 1 ]; then
    # A API de controle do MediaMTX (9997) devolve as URLs RTSP COM AS SENHAS
    # das câmeras. Ela deve ficar SOMENTE em 127.0.0.1.
    if ufw status | grep -q "9997"; then
        ufw delete allow 9997/tcp >/dev/null 2>&1 || true
        echo "Regra INSEGURA removida: porta 9997 (API do MediaMTX) exposta na rede."
    else
        echo "Nenhuma regra expondo a porta 9997 encontrada."
    fi
fi

echo
echo "Endereço desta máquina na tailnet (use o NOME no proxy do VPS, não o IP —"
echo "assim uma reinstalação não quebra o acesso remoto):"
if command -v tailscale >/dev/null; then
    tailscale status --self --peers=false 2>/dev/null || tailscale ip -4
else
    echo "  (tailscale não instalado: curl -fsSL https://tailscale.com/install.sh | sh)"
fi
