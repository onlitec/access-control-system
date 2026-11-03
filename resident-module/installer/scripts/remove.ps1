# Executado pelo desinstalador: para e remove o serviço. Dados e configuração em
# %ProgramData%\ModuloMorador são mantidos (apague a pasta manualmente se quiser zerar tudo).
param([Parameter(Mandatory)][string]$InstallDir)
$svc = Join-Path $InstallDir 'ModuloMorador.exe'
if (Get-Service -Name 'ModuloMorador' -ErrorAction SilentlyContinue) {
    & $svc stop 2>&1 | Out-Null
    & $svc uninstall 2>&1 | Out-Null
}
