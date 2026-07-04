# OnliAcesso - Limpeza de instalacao anterior
# Para servicos, remove registros orfaos e mata processos remanescentes que
# estejam rodando a partir da pasta de instalacao (destrava arquivos).
# Executado pelo instalador ANTES da copia de arquivos, e disponivel para uso
# manual: powershell -ExecutionPolicy Bypass -File cleanup.ps1
[CmdletBinding()]
param(
    [string]$TargetDir = "C:\OnliAcesso"
)

$ErrorActionPreference = "Continue"
$TargetDir = $TargetDir.TrimEnd('\')

Write-Host "OnliAcesso: limpando instalacao anterior em $TargetDir ..."

# 1. Parar e remover registros de servico (ordem inversa das dependencias)
$services = @(
    "onliacesso-proxy",
    "onliacesso-admin",
    "onliacesso-access",
    "onliacesso-visitor",
    "onliacesso-api",
    "onliacesso-postgres"
)
foreach ($svc in $services) {
    if (Get-Service -Name $svc -ErrorAction SilentlyContinue) {
        Write-Host "  parando servico $svc ..."
        Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
        sc.exe delete $svc | Out-Null
    }
}

# 2. Parada graciosa do PostgreSQL, se houver cluster ativo
$pgCtl   = Join-Path $TargetDir "binaries\pgsql\bin\pg_ctl.exe"
$pgData  = Join-Path $TargetDir "data\pgdata"
if ((Test-Path $pgCtl) -and (Test-Path (Join-Path $pgData "postmaster.pid"))) {
    Write-Host "  parando PostgreSQL remanescente ..."
    Start-Process -FilePath $pgCtl -ArgumentList "stop -D `"$pgData`" -m fast -w -t 30" `
        -NoNewWindow -Wait -ErrorAction SilentlyContinue
}

# 3. Matar qualquer processo que ainda rode a partir da pasta de instalacao
#    (postgres.exe, nginx.exe, node.exe, ffmpeg.exe, wrappers WinSW...)
$leftover = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$TargetDir\*" }
foreach ($p in $leftover) {
    Write-Host "  finalizando processo remanescente: $($p.ProcessName) (PID $($p.Id))"
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}

if ($leftover) { Start-Sleep -Seconds 3 }

Write-Host "Limpeza concluida."
exit 0
