# OnliAcesso - Desinstalador Windows
# Remove os servicos e (opcionalmente) os dados.
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1 [-RemoveData]
[CmdletBinding()]
param(
    [string]$TargetDir = "C:\OnliAcesso",
    [switch]$RemoveData
)

$ErrorActionPreference = "Continue"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Execute como Administrador."
    exit 1
}

$ServicesDir = Join-Path $TargetDir "services"

# Parar e remover na ordem inversa das dependencias
$ServiceOrder = @(
    "onliacesso-proxy",
    "onliacesso-admin",
    "onliacesso-access",
    "onliacesso-visitor",
    "onliacesso-api",
    "onliacesso-postgres"
)

foreach ($svc in $ServiceOrder) {
    if (Get-Service -Name $svc -ErrorAction SilentlyContinue) {
        Write-Host "Parando e removendo servico $svc ..."
        Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
        $svcExe = Join-Path $ServicesDir "$svc.exe"
        if (Test-Path $svcExe) {
            & $svcExe uninstall | Out-Null
        } else {
            sc.exe delete $svc | Out-Null
        }
    }
}

if (Get-NetFirewallRule -DisplayName "OnliAcesso HTTP" -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName "OnliAcesso HTTP"
    Write-Host "Regra de firewall removida."
}

# Parada graciosa do PostgreSQL, se sobrou um processo fora de servico
$pgCtl  = Join-Path $TargetDir "binaries\pgsql\bin\pg_ctl.exe"
$pgData = Join-Path $TargetDir "data\pgdata"
if ((Test-Path $pgCtl) -and (Test-Path (Join-Path $pgData "postmaster.pid"))) {
    Write-Host "Parando PostgreSQL remanescente ..."
    Start-Process -FilePath $pgCtl -ArgumentList "stop -D `"$pgData`" -m fast -w -t 30" `
        -NoNewWindow -Wait -ErrorAction SilentlyContinue
}

# Matar qualquer processo remanescente rodando a partir da pasta de instalacao
# (senao o Windows nao deixa excluir a pasta)
$leftover = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$TargetDir\*" }
foreach ($p in $leftover) {
    Write-Host "Finalizando processo remanescente: $($p.ProcessName) (PID $($p.Id))"
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
if ($leftover) { Start-Sleep -Seconds 3 }

if ($RemoveData) {
    Write-Host "Removendo dados e configuracoes em $TargetDir ..."
    Remove-Item -Recurse -Force (Join-Path $TargetDir "data") -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force (Join-Path $TargetDir "config") -ErrorAction SilentlyContinue
    Remove-Item -Force (Join-Path $TargetDir "apps\backend-api\.env") -ErrorAction SilentlyContinue
} else {
    Write-Host "Dados preservados em $TargetDir\data (use -RemoveData para apagar)."
}

Write-Host "Desinstalacao concluida."
exit 0
