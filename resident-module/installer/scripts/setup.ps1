# Executado pelo instalador (como administrador). Cria pastas de dados, o arquivo .env
# (só na primeira instalação) e registra/inicia o serviço do Windows.
param(
    [Parameter(Mandatory)][string]$InstallDir,
    [string]$HikHost = '',
    [string]$HikAppKey = '',
    [string]$HikAppSecret = '',
    [string]$HikUserId = 'admin',
    [string]$PublicUrl = '',
    [string]$Port = '4100'
)
$ErrorActionPreference = 'Stop'

$data = Join-Path $env:ProgramData 'ModuloMorador'
$cfgDir = Join-Path $data 'config'
$envFile = Join-Path $cfgDir '.env'
New-Item -ItemType Directory -Force -Path $cfgDir, (Join-Path $data 'data'), (Join-Path $data 'logs') | Out-Null

if (-not (Test-Path $envFile)) {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $jwt = [Convert]::ToBase64String($bytes)
    # Par de chaves das notificações push, gerado com o Node do próprio pacote.
    $vapid = & (Join-Path $InstallDir 'node\node.exe') (Join-Path $InstallDir 'app\dist\scripts\vapid-keys.js')
    $vapidPub = (($vapid | Where-Object { $_ -like 'VAPID_PUBLIC_KEY=*' }) -replace '^VAPID_PUBLIC_KEY=', '')
    $vapidPriv = (($vapid | Where-Object { $_ -like 'VAPID_PRIVATE_KEY=*' }) -replace '^VAPID_PRIVATE_KEY=', '')
    $db = ((Join-Path $data 'data\resident.db') -replace '\\', '/')
    $content = @"
HOST=127.0.0.1
PORT=$Port
PUBLIC_URL=$PublicUrl
JWT_SECRET=$jwt
DATABASE_URL=file:$db
HIK_HOST=$HikHost
HIK_APP_KEY=$HikAppKey
HIK_APP_SECRET=$HikAppSecret
HIK_USER_ID=$HikUserId
HIK_INSECURE_TLS=false
HIKCENTRAL_TZ_OFFSET=-03:00
# Preencha para enviar WhatsApp (Twilio) e/ou e-mail; sem isso o login por código não envia nada.
NOTIFY_MODE=live
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
VAPID_PUBLIC_KEY=$vapidPub
VAPID_PRIVATE_KEY=$vapidPriv
VAPID_SUBJECT=mailto:contato@seudominio.com.br
"@
    Set-Content -Path $envFile -Value $content -Encoding UTF8
}

# Somente SYSTEM e Administradores leem/gravam a configuração (contém segredos).
& icacls.exe $cfgDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
& icacls.exe (Join-Path $data 'data') /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null

$svc = Join-Path $InstallDir 'ModuloMorador.exe'
$existing = Get-Service -Name 'ModuloMorador' -ErrorAction SilentlyContinue
if (-not $existing) { & $svc install | Out-Null }
& $svc restart 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { & $svc start | Out-Null }
Write-Host 'Serviço ModuloMorador instalado e iniciado.'
