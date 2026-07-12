# OnliAcesso - Instalador Windows (pos-instalacao)
# Executado pelo Inno Setup apos copiar os arquivos, ou manualmente:
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-SourceDir <dir>] [...]
[CmdletBinding()]
param(
    [string]$SourceDir = "",
    [string]$TargetDir = "C:\OnliAcesso",
    [string]$CondoName = "Condominio",
    [string]$HikIp = "",
    [string]$HikAppKey = "",
    [string]$HikAppSecret = "",
    [string]$AdminEmail = "admin@onliacesso.local",
    [string]$AppVersion = "0.0.0",
    [string]$InstallVms = "0"
)

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $env:TEMP "onliacesso-install.log"

# Integracao com o wizard do Inno Setup (que roda este script oculto):
# - StatusFile: mensagem da etapa atual, exibida na pagina de progresso
# - ExitFile:   escrito ao final com o codigo de saida (sinaliza conclusao)
$StatusFile = Join-Path $env:TEMP "onliacesso-install-status.txt"
$ExitFile   = Join-Path $env:TEMP "onliacesso-install-exit.txt"
Remove-Item $ExitFile -Force -ErrorAction SilentlyContinue

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

# Registra no log e atualiza a etapa mostrada no wizard (texto sem acentos:
# o Inno le o arquivo como ANSI)
function Set-Status($msg) {
    Log $msg
    Set-Content -Path $StatusFile -Value $msg -Encoding ASCII -ErrorAction SilentlyContinue
}

# Executa um binario nativo via Start-Process com timeout.
# Nao usar `& exe 2>&1`: alem do stderr virar erro terminante no PS 5.1,
# processos que geram filhos daemonizados (pg_ctl start -> postgres.exe)
# herdam os handles de saida e travam o pipeline para sempre.
function Invoke-Native {
    param(
        [string]$FailMsg,
        [string]$Exe,
        [string[]]$ArgList,
        [int]$TimeoutSec = 300
    )
    $quoted = $ArgList | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }
    $outF = [System.IO.Path]::GetTempFileName()
    $errF = [System.IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $Exe -ArgumentList ($quoted -join ' ') `
            -NoNewWindow -PassThru -WorkingDirectory (Get-Location).Path `
            -RedirectStandardOutput $outF -RedirectStandardError $errF
        # sem cachear o Handle, o ExitCode de processos rapidos volta $null
        $null = $p.Handle
        if (-not $p.WaitForExit($TimeoutSec * 1000)) {
            try { $p.Kill() } catch {}
            throw "$FailMsg (timeout de ${TimeoutSec}s excedido: $(Split-Path -Leaf $Exe)). Detalhes em $LogFile"
        }
        $p.WaitForExit()  # garante flush dos streams e ExitCode disponivel
        $output = @()
        foreach ($f in @($outF, $errF)) {
            $txt = Get-Content -Path $f -ErrorAction SilentlyContinue
            if ($txt) { $output += $txt }
        }
        if ($output) { $output | Add-Content -Path $LogFile }
        if ($p.ExitCode -ne 0) {
            throw "$FailMsg (comando: $(Split-Path -Leaf $Exe), codigo $($p.ExitCode)). Detalhes em $LogFile"
        }
        return $output
    } finally {
        Remove-Item $outF, $errF -Force -ErrorAction SilentlyContinue
    }
}

try {
    Log "===== OnliAcesso install.ps1 iniciado ====="
    Set-Status "Preparando a instalacao..."

    # --------------------------------------------------- 1. Verificar admin
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Este instalador precisa ser executado como Administrador."
    }
    Log "Privilegios de administrador confirmados."

    # -------------------------------------------------- 2. Detectar IP local
    $LocalIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
        Sort-Object -Property {
            # preferir LAN (RFC 1918); depois outros; CGNAT 100.64/10 (Tailscale/VPN) por ultimo
            if ($_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" -or
                $_.IPAddress -match "^172\.(1[6-9]|2[0-9]|3[01])\.") { 0 }
            elseif ($_.IPAddress -match "^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.") { 2 }
            else { 1 }
        } |
        Select-Object -First 1).IPAddress
    if (-not $LocalIp) { $LocalIp = "127.0.0.1" }
    Log "IP local detectado: $LocalIp"

    # ----------------------------------- 3. Copiar arquivos para o TargetDir
    if ([string]::IsNullOrWhiteSpace($SourceDir)) {
        $SourceDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    }
    $SourceDir = (Resolve-Path $SourceDir).Path.TrimEnd('\')
    $TargetDir = $TargetDir.TrimEnd('\')

    if ($SourceDir -ne $TargetDir) {
        Set-Status "Copiando arquivos da aplicacao..."
        Log "Copiando arquivos de $SourceDir para $TargetDir ..."
        New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
        robocopy $SourceDir $TargetDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Falha ao copiar arquivos (robocopy: $LASTEXITCODE)" }
    } else {
        Log "Arquivos ja estao em $TargetDir (copia dispensada)."
    }

    foreach ($d in @("data", "logs", "config", "backups")) {
        New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir $d) | Out-Null
    }

    # NOTA: TLS/HTTPS (nginx ssl_certificate + ssl_certificate_key em PEM) foi
    # planejado mas revertido nesta versao - New-SelfSignedCertificate gera o
    # certificado, mas exportar a chave privada em PEM a partir dele exige
    # OpenSSL ou codificacao ASN.1/PKCS#1 manual, que nao tem suporte nativo
    # confiavel no `powershell.exe` (PowerShell 5.1) usado pelo Inno Setup.
    # O proxy permanece em HTTP simples ate isso ser resolvido corretamente
    # (empacotar um openssl.exe, ou emitir via ACME/Let's Encrypt quando
    # houver dominio publico).

    $Bin     = Join-Path $TargetDir "binaries"
    $Apps    = Join-Path $TargetDir "apps"
    $PgBin   = Join-Path $Bin "pgsql\bin"
    $PgData  = Join-Path $TargetDir "data\pgdata"
    $NodeExe = Join-Path $Bin "node\node.exe"
    $Backend = Join-Path $Apps "backend-api"
    $LogsDir = Join-Path $TargetDir "logs"

    # ------------------------------------------------ 4. Gerar senhas seguras
    function New-SecureToken([int]$bytes = 32) {
        $buf = New-Object byte[] $bytes
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
        return ([System.BitConverter]::ToString($buf) -replace "-", "").ToLower()
    }

    $EnvFile  = Join-Path $Backend ".env"
    $CredFile = Join-Path $TargetDir "config\credenciais.txt"
    # a senha do banco vive junto com os dados: sobrevive a desinstalacao
    # (que preserva data\) e evita cluster orfao com senha perdida
    $DbSecretFile = Join-Path $TargetDir "data\db-secret.txt"

    # Defaults de SMTP: arquivo empacotado no instalador (nao versionado no
    # git - o repositorio e publico e a chave nao pode vazar)
    $SmtpDefaults = @{
        SMTP_HOST = 'smtp-relay.brevo.com'; SMTP_PORT = '587'
        SMTP_USER = ''; SMTP_PASSWORD = ''; SMTP_FROM = ''; SMTP_FROM_NAME = 'OnliAcesso'
    }
    $SmtpFile = Join-Path $PSScriptRoot 'smtp-defaults.env'
    if (Test-Path $SmtpFile) {
        foreach ($line in Get-Content $SmtpFile) {
            if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$') {
                $SmtpDefaults[$Matches[1]] = $Matches[2].Trim()
            }
        }
        Log "Defaults de SMTP carregados de smtp-defaults.env."
    } else {
        Log "smtp-defaults.env ausente - SMTP devera ser configurado no painel admin."
    }

    if (Test-Path $EnvFile) {
        Log "Arquivo .env ja existe - preservando configuracao atual."
        $m = (Select-String -Path $EnvFile -Pattern "postgresql://postgres:([^@]+)@127\.0\.0\.1:(\d+)/").Matches[0]
        $DbPassword = $m.Groups[1].Value
        $PgPort = [int]$m.Groups[2].Value
        Log "Porta do PostgreSQL (do .env existente): $PgPort"
    } else {
        # se ja existe outro PostgreSQL/servico na 5432 (instalacao previa de
        # outro produto), usa 5433 para nao conflitar
        $PgPort = 5432
        if (Get-NetTCPConnection -State Listen -LocalPort 5432 -ErrorAction SilentlyContinue) {
            $PgPort = 5433
            Log "Porta 5432 ja esta em uso por outro processo - usando porta $PgPort."
        }
        # reaproveita a senha do cluster de uma instalacao anterior, se houver
        if (Test-Path $DbSecretFile) {
            $DbPassword = (Get-Content $DbSecretFile -Raw).Trim()
            Log "Senha do PostgreSQL reaproveitada de data\db-secret.txt."
        } else {
            $DbPassword = New-SecureToken 24
        }
        $JwtSecret     = New-SecureToken 48
        $AdminPassword = New-SecureToken 12

        $ProviderType = "local"
        if ($HikIp -and $HikAppKey -and $HikAppSecret) { $ProviderType = "hikcentral" }

        # ---------------------------------------------- 5. Preencher o .env
        $envContent = @"
# OnliAcesso - gerado pelo instalador em $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# Condominio: $CondoName
NODE_ENV=production
PORT=3001
APP_URL=http://$LocalIp
DATABASE_URL=postgresql://postgres:$DbPassword@127.0.0.1:$PgPort/onliacesso?schema=public
JWT_SECRET=$JwtSecret
PROVIDER_TYPE=$ProviderType
HIKCENTRAL_IP_BASE=$HikIp
HIKCENTRAL_APP_KEY=$HikAppKey
HIKCENTRAL_APP_SECRET=$HikAppSecret
HIK_SSL_VERIFY=false
INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_EMAIL=$AdminEmail
INITIAL_ADMIN_PASSWORD=$AdminPassword
FFMPEG_PATH=$Bin\ffmpeg\bin\ffmpeg.exe
# SMTP - envio do codigo de verificacao do primeiro cadastro.
# Valores vem de scripts\smtp-defaults.env (empacotado no instalador, fora do
# git). Sem o arquivo, configure o SMTP depois no painel admin (Configuracoes
# do Sistema), que grava no banco.
SMTP_HOST=$($SmtpDefaults['SMTP_HOST'])
SMTP_PORT=$($SmtpDefaults['SMTP_PORT'])
SMTP_USER=$($SmtpDefaults['SMTP_USER'])
SMTP_PASSWORD=$($SmtpDefaults['SMTP_PASSWORD'])
SMTP_FROM=$($SmtpDefaults['SMTP_FROM'])
SMTP_FROM_NAME=$($SmtpDefaults['SMTP_FROM_NAME'])
"@
        Set-Content -Path $EnvFile -Value $envContent -Encoding ASCII
        Log ".env gerado em $EnvFile (provider: $ProviderType)."

        $credContent = @"
OnliAcesso - Credenciais geradas na instalacao ($(Get-Date -Format "yyyy-MM-dd HH:mm"))
GUARDE ESTE ARQUIVO EM LOCAL SEGURO E APAGUE-O DEPOIS.

Painel:        http://$LocalIp/painel/
Admin:         http://$LocalIp/admin/
Portal:        http://$LocalIp/login/

Admin inicial: $AdminEmail
Senha inicial: $AdminPassword

PostgreSQL (usuario postgres, porta $PgPort): $DbPassword
"@
        Set-Content -Path $CredFile -Value $credContent -Encoding ASCII
        Log "Credenciais salvas em $CredFile"
    }

    # -------------------- 5b. Chaves de infraestrutura no .env (novo/upgrade)
    # Em upgrade o .env é preservado, mas versões novas podem exigir chaves
    # novas: garante cada chave sem tocar no restante. APP_VERSION é sempre
    # sobrescrita (reflete a versão instalada).
    function Set-EnvKey([string]$Key, [string]$Value, [bool]$Overwrite = $false) {
        $content = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue
        if ($null -eq $content) { $content = "" }
        if ($content -match "(?m)^$([regex]::Escape($Key))=") {
            if ($Overwrite) {
                $content = $content -replace "(?m)^$([regex]::Escape($Key))=.*$", "$Key=$Value"
                Set-Content -Path $EnvFile -Value $content.TrimEnd() -Encoding ASCII
            }
        } else {
            Add-Content -Path $EnvFile -Value "$Key=$Value" -Encoding ASCII
        }
    }
    Set-EnvKey "APP_VERSION" $AppVersion $true
    Set-EnvKey "UPDATE_MANIFEST_URL" "https://cloud.onlitec.com.br/downloads/latest.json"
    Set-EnvKey "BACKUP_DIR" "$TargetDir\backups"
    Set-EnvKey "PG_BIN" "$Bin\pgsql\bin"
    # WinSW v3 grava os logs dos servicos ao lado dos wrappers (services\)
    Set-EnvKey "SERVICE_LOGS_DIR" "$TargetDir\services" $true
    Log "Chaves de infraestrutura garantidas no .env (APP_VERSION=$AppVersion)."

    # ---- VMS: chaves de ambiente (só quando componente selecionado).
    # Nomes DEVEM bater com backend-api/src/vms/config.ts e vms.routes.ts.
    if ($InstallVms -eq "1") {
        Set-EnvKey "MEDIAMTX_API_URL"   "http://127.0.0.1:9997"
        Set-EnvKey "VMS_PORT"           "3011"
        Set-EnvKey "VMS_RECORDINGS_DIR" "$TargetDir\data\recordings"
        Set-EnvKey "VMS_MAX_DISK_GB"    "0"
        # Espaco livre minimo no disco: abaixo disso o VMS apaga gravacoes antigas
        # e, se persistir, PAUSA a gravacao (disco cheio trava o MediaMTX e ameaca
        # o PostgreSQL). Ver docs do modulo VMS.
        Set-EnvKey "VMS_MIN_FREE_GB"    "10"
        Set-EnvKey "RCLONE_PATH"        "$Bin\rclone\rclone.exe"
        Set-EnvKey "RCLONE_CONFIG"      "$TargetDir\config\rclone.conf"
        # Token compartilhado backend-api <-> vms-service <-> hooks MediaMTX
        # (sem Overwrite: preservado em upgrades para não invalidar hooks ativos)
        Set-EnvKey "VMS_INTERNAL_TOKEN" (New-SecureToken 32)
        New-Item -ItemType Directory -Force -Path "$TargetDir\data\recordings" | Out-Null
        Log "Chaves VMS garantidas no .env."
    }

    # ------------------------------------------- 6. Permissoes (ACL) e initdb
    # O postgres.exe recusa executar com token administrativo, entao o servico
    # roda como NetworkService (S-1-5-20) - que precisa de acesso aos arquivos.
    $CurrentUser = (& whoami).Trim()
    Set-Status "Ajustando permissoes de arquivos..."
    Log "Ajustando permissoes para NetworkService e $CurrentUser ..."
    # ACE (OI)(CI) na raiz propaga por heranca aos filhos; nao usar /T
    # (reescreveria a ACL de milhares de arquivos, demorando minutos)
    Invoke-Native "Falha ao ajustar ACL do diretorio de instalacao" "icacls.exe" @(
        $TargetDir, "/grant", "*S-1-5-20:(OI)(CI)RX", "/Q")
    Invoke-Native "Falha ao ajustar ACL do diretorio de logs" "icacls.exe" @(
        $LogsDir, "/grant", "*S-1-5-20:(OI)(CI)M", "/Q")

    if ((Test-Path $PgData) -and -not (Test-Path (Join-Path $PgData "PG_VERSION"))) {
        Log "Removendo cluster PostgreSQL incompleto de instalacao anterior..."
        Remove-Item -Recurse -Force $PgData
    }

    if (-not (Test-Path (Join-Path $PgData "PG_VERSION"))) {
        Set-Status "Inicializando o banco de dados PostgreSQL..."
        Log "Inicializando cluster PostgreSQL em $PgData ..."
        New-Item -ItemType Directory -Force -Path $PgData | Out-Null
        # initdb roda com token restrito (sem grupo Administrators), entao o
        # usuario atual precisa de ACE explicita alem da herdada
        Invoke-Native "Falha ao ajustar ACL do diretorio de dados" "icacls.exe" @(
            $PgData, "/grant", "*S-1-5-20:(OI)(CI)F", "${CurrentUser}:(OI)(CI)F", "/Q")

        $pwFile = Join-Path $env:TEMP "onliacesso-pgpw.tmp"
        Set-Content -Path $pwFile -Value $DbPassword -Encoding ASCII
        try {
            Invoke-Native "initdb falhou" (Join-Path $PgBin "initdb.exe") @(
                "-D", $PgData, "-U", "postgres", "-A", "scram-sha-256",
                "--pwfile=$pwFile", "-E", "UTF8", "--no-locale")
        } finally {
            Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
        }
        Add-Content -Path (Join-Path $PgData "postgresql.conf") -Value "`nlisten_addresses = '127.0.0.1'`nport = $PgPort"
        Log "Cluster PostgreSQL criado."
    } else {
        Log "Cluster PostgreSQL ja existe - initdb dispensado."
    }

    # Garante escrita da conta do servico (NetworkService) sobre o pgdata em
    # TODA instalacao - inclusive quando o cluster foi criado por uma versao
    # anterior do instalador (initdb dispensado). Sem isso o servico postgres
    # falha ao iniciar por nao conseguir gravar WAL/dados.
    Invoke-Native "Falha ao garantir ACL do pgdata" "icacls.exe" @(
        $PgData, "/grant", "*S-1-5-20:(OI)(CI)F", "/Q")

    # --------------------------------------- 7. Criar banco + migracoes Prisma
    $PgCtlExe   = Join-Path $PgBin "pg_ctl.exe"
    $PsqlExe    = Join-Path $PgBin "psql.exe"
    $PgStartLog = Join-Path $LogsDir "postgres-install.log"

    # postgres pode ter ficado rodando de uma tentativa anterior interrompida
    $pgRunning = $false
    try {
        Invoke-Native "status" (Join-Path $PgBin "pg_ctl.exe") @("status", "-D", $PgData) -TimeoutSec 30 | Out-Null
        $pgRunning = $true
        Log "PostgreSQL ja esta em execucao (instalacao anterior) - reaproveitando."
    } catch {}

    if (-not $pgRunning) {
        Set-Status "Iniciando o banco de dados..."
        Log "Iniciando PostgreSQL temporariamente ..."
        try {
            Invoke-Native "pg_ctl start falhou" (Join-Path $PgBin "pg_ctl.exe") @(
                "start", "-D", $PgData, "-w", "-t", "120", "-l", $PgStartLog) -TimeoutSec 180
        } catch {
            # o motivo real da falha fica no log do proprio postgres
            if (Test-Path $PgStartLog) {
                Log "--- ultimas linhas de postgres-install.log ---"
                Get-Content $PgStartLog -Tail 40 -ErrorAction SilentlyContinue | Add-Content $LogFile
                Log "--- fim de postgres-install.log ---"
            }
            throw
        }
    }

    # Cluster de instalacao anterior pode ter senha diferente da do .env atual
    # (ex.: desinstalacao removeu o .env mas preservou os dados). Testa a
    # autenticacao e, se falhar, redefine a senha via modo trust temporario
    # (pg_hba.conf, somente localhost).
    $env:PGPASSWORD = $DbPassword
    $authOk = $true
    try {
        Invoke-Native "teste de autenticacao" $PsqlExe @(
            "-U", "postgres", "-h", "127.0.0.1", "-p", "$PgPort", "-tAc", "SELECT 1") -TimeoutSec 60 | Out-Null
    } catch {
        $authOk = $false
    }
    if (-not $authOk) {
        Log "Senha do postgres nao confere com o cluster existente - redefinindo ..."
        $HbaFile = Join-Path $PgData "pg_hba.conf"
        Invoke-Native "pg_ctl stop (reset de senha)" $PgCtlExe @(
            "stop", "-D", $PgData, "-m", "fast", "-w") -TimeoutSec 120
        Copy-Item $HbaFile "$HbaFile.bak" -Force
        try {
            Set-Content -Path $HbaFile -Encoding ASCII -Value @(
                "host    all    all    127.0.0.1/32    trust",
                "host    all    all    ::1/128         trust")
            Invoke-Native "pg_ctl start (modo trust) falhou" $PgCtlExe @(
                "start", "-D", $PgData, "-w", "-t", "120", "-l", $PgStartLog) -TimeoutSec 180
            Invoke-Native "redefinicao de senha falhou" $PsqlExe @(
                "-U", "postgres", "-h", "127.0.0.1", "-p", "$PgPort",
                "-c", "ALTER USER postgres PASSWORD '$DbPassword'")
            Invoke-Native "pg_ctl stop (pos-reset)" $PgCtlExe @(
                "stop", "-D", $PgData, "-m", "fast", "-w") -TimeoutSec 120
        } finally {
            Move-Item "$HbaFile.bak" $HbaFile -Force
        }
        Invoke-Native "pg_ctl start (pos-reset) falhou" $PgCtlExe @(
            "start", "-D", $PgData, "-w", "-t", "120", "-l", $PgStartLog) -TimeoutSec 180
        Log "Senha do postgres redefinida com sucesso."
    }

    # persiste a senha junto com os dados para futuras reinstalacoes
    Set-Content -Path $DbSecretFile -Value $DbPassword -Encoding ASCII
    # segredos legiveis apenas por Administradores e SYSTEM
    foreach ($secret in @($DbSecretFile, $CredFile)) {
        if (Test-Path $secret) {
            Invoke-Native "ACL de $secret" "icacls.exe" @(
                $secret, "/inheritance:r", "/grant", "*S-1-5-32-544:F", "*S-1-5-18:F", "/Q")
        }
    }

    try {
        $dbExists = Invoke-Native "psql falhou" $PsqlExe @(
            "-U", "postgres", "-h", "127.0.0.1", "-p", "$PgPort", "-tAc",
            "SELECT 1 FROM pg_database WHERE datname='onliacesso'")
        if (($dbExists -join "") -notmatch "1") {
            Invoke-Native "createdb falhou" (Join-Path $PgBin "createdb.exe") @(
                "-U", "postgres", "-h", "127.0.0.1", "-p", "$PgPort", "onliacesso")
            Log "Banco 'onliacesso' criado."
        } else {
            Log "Banco 'onliacesso' ja existe."
        }

        Set-Status "Aplicando migracoes do banco de dados..."
        Log "Executando prisma migrate deploy ..."
        Push-Location $Backend
        try {
            $env:DATABASE_URL = "postgresql://postgres:$DbPassword@127.0.0.1:$PgPort/onliacesso?schema=public"
            $env:CHECKPOINT_DISABLE = "1"   # telemetria do Prisma: evita acesso a internet
            Invoke-Native "prisma migrate deploy falhou" $NodeExe @(
                "node_modules\prisma\build\index.js", "migrate", "deploy",
                "--schema", "prisma\schema.prisma")
            Log "Migracoes aplicadas com sucesso."

            # cria o admin protegido a partir de INITIAL_ADMIN_* (escritos no .env).
            # NAO usar bootstrap-admin.js: ele le ADMIN_*/ADMIN_PASSWORD (nomes
            # diferentes) e falha. create-protected-admin.js usa INITIAL_ADMIN_*.
            if (Test-Path "dist\scripts\create-protected-admin.js") {
                Set-Status "Criando usuario administrador..."
                Log "Criando usuario administrador inicial (protegido) ..."
                Invoke-Native "create-protected-admin falhou" $NodeExe @("dist\scripts\create-protected-admin.js")
            } else {
                Log "AVISO: create-protected-admin.js nao encontrado - admin inicial nao criado."
            }
        } finally {
            Pop-Location
        }
    } finally {
        try {
            Invoke-Native "pg_ctl stop falhou" (Join-Path $PgBin "pg_ctl.exe") @(
                "stop", "-D", $PgData, "-m", "fast", "-w")
        } catch {
            Log "Aviso: $_"
        }
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:\CHECKPOINT_DISABLE -ErrorAction SilentlyContinue
    }

    # ------------------------------------ 8. Registrar e iniciar servicos WinSW
    Set-Status "Registrando os servicos do Windows..."
    $ServicesDir = Join-Path $TargetDir "services"
    $WinSW = Join-Path $Bin "winsw\WinSW-x64.exe"
    $ServiceOrder = @(
        "onliacesso-postgres",
        "onliacesso-api",
        "onliacesso-visitor",
        "onliacesso-access",
        "onliacesso-admin",
        "onliacesso-proxy"
    )
    if ($InstallVms -eq "1") {
        $ServiceOrder += @("onliacesso-mediamtx", "onliacesso-vms")
        Log "Servicos VMS incluidos na ordem de inicializacao."
    }

    foreach ($svc in $ServiceOrder) {
        $svcExe = Join-Path $ServicesDir "$svc.exe"
        if (-not (Test-Path $svcExe)) {
            Copy-Item $WinSW $svcExe
        }
        if (Get-Service -Name $svc -ErrorAction SilentlyContinue) {
            Log "Servico $svc ja registrado - atualizando ..."
            try { Invoke-Native "stop $svc" $svcExe @("stop") } catch { Log "Aviso: $_" }
            try { Invoke-Native "uninstall $svc" $svcExe @("uninstall") } catch { Log "Aviso: $_" }
        }
        Invoke-Native "Falha ao registrar servico $svc" $svcExe @("install")
        Log "Servico $svc registrado."

        # O servico postgres roda como NetworkService; no start, o WinSW v3
        # reabre o proprio servico com direitos de escrita (refresh da config
        # a partir do XML). Sem uma ACE de acesso total para NetworkService no
        # objeto do servico, o start falha com "Failed to open the service.
        # Acesso negado." e o SCM expira em 30s (evento 7009).
        if ($svc -eq "onliacesso-postgres") {
            Invoke-Native "Falha ao ajustar ACL do servico $svc" "sc.exe" @(
                "sdset", $svc,
                "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;NS)")
            Log "ACL do servico $svc ajustada (NetworkService)."
        }
    }

    # Regra de firewall para a porta 80 (proxy)
    if (-not (Get-NetFirewallRule -DisplayName "OnliAcesso HTTP" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "OnliAcesso HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
        Log "Regra de firewall criada (TCP 80)."
    }

    # WebRTC do VMS: a midia trafega em UDP 8189 DIRETO do MediaMTX para o
    # navegador do operador (nao passa pelo nginx da porta 80). Sem esta regra o
    # video ao vivo so funciona na propria maquina — de outro PC da rede a
    # imagem nunca aparece, mesmo com o painel abrindo normalmente.
    if ($InstallVms -eq "1" -and -not (Get-NetFirewallRule -DisplayName "OnliAcesso VMS WebRTC (UDP 8189)" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "OnliAcesso VMS WebRTC (UDP 8189)" -Direction Inbound -Protocol UDP -LocalPort 8189 -Action Allow | Out-Null
        Log "Regra de firewall criada (UDP 8189 - WebRTC do VMS)."
    }

    $failed = @()
    foreach ($svc in $ServiceOrder) {
        Set-Status "Iniciando o servico $svc..."
        Log "Iniciando servico $svc ..."
        try {
            Start-Service -Name $svc
        } catch {
            $failed += $svc
            Log "ERRO ao iniciar ${svc}: $($_.Exception.Message)"
        }
        # apos iniciar o postgres, aguardar aceitar conexoes antes dos
        # dependentes (o SCM reporta "running" quando o processo sobe, nao
        # quando o banco esta pronto) - evita crash-restart da API no 1o boot
        if ($svc -eq "onliacesso-postgres") {
            Log "Aguardando o PostgreSQL aceitar conexoes ..."
            $ready = $false
            for ($i = 0; $i -lt 30; $i++) {
                Start-Sleep -Seconds 1
                & (Join-Path $PgBin "pg_isready.exe") -h 127.0.0.1 -p $PgPort -q 2>$null
                if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            }
            if ($ready) { Log "PostgreSQL pronto." }
            else { Log "AVISO: PostgreSQL nao respondeu em 30s; a API ira reconectar automaticamente." }
        }
    }

    Copy-Item $LogFile (Join-Path $LogsDir "install.log") -Force -ErrorAction SilentlyContinue

    if ($failed.Count -gt 0) {
        throw "Servicos registrados, mas falharam ao iniciar: $($failed -join ', '). Veja os logs em $LogsDir"
    }

    Set-Status "Instalacao concluida."
    Log "Instalacao concluida com sucesso. Credenciais em $CredFile"
    Set-Content -Path $ExitFile -Value "0" -Encoding ASCII
    exit 0
} catch {
    Log "ERRO FATAL: $($_.Exception.Message)"
    if ($_.ScriptStackTrace) { Log $_.ScriptStackTrace }
    try {
        Copy-Item $LogFile (Join-Path $TargetDir "logs\install.log") -Force -ErrorAction SilentlyContinue
    } catch {}
    Set-Content -Path $ExitFile -Value "1" -Encoding ASCII -ErrorAction SilentlyContinue
    exit 1
}
