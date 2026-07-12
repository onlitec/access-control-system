# OnliAcesso — libera o acesso remoto (cloud bridge) para o VPS via Tailscale.
#
# Estas regras NÃO são criadas pelo instalador de propósito: o acesso remoto é
# opcional e depende do IP do VPS na tailnet. Rode este script apenas na máquina
# que serve os dados ao cloud.onlitec.com.br.
#
# Uso (PowerShell como Administrador):
#   .\enable-cloud-access.ps1 -VpsTailscaleIp 100.90.27.7
#
# Depois de rodar, atualize o proxy do VPS para apontar a ESTA máquina —
# use o nome MagicDNS (`tailscale status`), não o IP, para sobreviver a
# reinstalações. Ver deploy/cloud/nginx-proxy-manager.conf.

param(
    [Parameter(Mandatory = $true)]
    [string]$VpsTailscaleIp,

    # Remove a regra insegura que expõe a API de controle do MediaMTX (9997) a
    # toda a rede: /v3/config/paths/list devolve as URLs RTSP COM AS SENHAS das
    # câmeras. A API deve ficar apenas em 127.0.0.1.
    [switch]$FixMediaMtxApiExposure
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute este script como Administrador."
}

if ($VpsTailscaleIp -notmatch '^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
    throw "IP '$VpsTailscaleIp' não parece um endereço Tailscale (100.x.y.z)."
}

# Portas que o VPS consome do servidor local. Nada aqui é aberto para a
# internet: o RemoteAddress restringe a origem ao VPS dentro da tailnet.
$rules = @(
    @{ Name = "OnliAcesso API (cloud via Tailscale)";        Port = 3001; Desc = "backend: login e API das cameras" },
    @{ Name = "OnliAcesso VMS HLS (cloud via Tailscale)";    Port = 8888; Desc = "MediaMTX HLS (exige ?jwt=)" },
    @{ Name = "OnliAcesso VMS WebRTC signaling (cloud)";     Port = 8889; Desc = "MediaMTX WHEP signaling" }
)

foreach ($r in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
    if ($existing) {
        # Reaponta a regra para o IP atual do VPS em vez de duplicá-la
        $existing | Set-NetFirewallRule -RemoteAddress $VpsTailscaleIp
        Write-Host "Regra atualizada: $($r.Name) -> origem $VpsTailscaleIp"
    } else {
        New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Protocol TCP `
            -LocalPort $r.Port -RemoteAddress $VpsTailscaleIp -Action Allow `
            -Description $r.Desc | Out-Null
        Write-Host "Regra criada:    $($r.Name) (TCP $($r.Port), origem $VpsTailscaleIp)"
    }
}

if ($FixMediaMtxApiExposure) {
    $bad = Get-NetFirewallRule -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like "MediaMTX API*" } |
        Where-Object {
            $addr = ($_ | Get-NetFirewallAddressFilter).RemoteAddress
            $addr -eq "Any"
        }
    foreach ($rule in $bad) {
        Remove-NetFirewallRule -InputObject $rule
        Write-Host "Regra INSEGURA removida: $($rule.DisplayName) (porta 9997 aberta para toda a rede)"
    }
    if (-not $bad) { Write-Host "Nenhuma regra expondo a porta 9997 encontrada." }
}

Write-Host ""
Write-Host "Pronto. Nome desta maquina na tailnet (use-o no proxy do VPS):"
$ts = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
if (Test-Path $ts) { & $ts status --self --peers=false } else { Write-Host "  (tailscale.exe nao encontrado)" }
