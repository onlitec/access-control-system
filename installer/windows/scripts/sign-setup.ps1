# OnliAcesso - assinatura Authenticode do instalador.
# Uso: powershell -ExecutionPolicy Bypass -File sign-setup.ps1 -SetupExe <caminho do .exe>
#
# Sem certificado comercial: gera (uma única vez) um certificado code-signing
# AUTO-ASSINADO e o usa. O auto-assinado garante integridade do arquivo, mas o
# SmartScreen ainda avisa em máquinas que não confiam no certificado.
# Para trocar por um certificado real (OV/EV): coloque o .pfx comprado em
# -PfxPath e informe -PfxPassword — o restante do fluxo é idêntico.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SetupExe,
    [string]$PfxPath = "",
    [string]$PfxPassword = "onliacesso-selfsigned",
    [string]$Subject = "CN=Onlitec OnliAcesso",
    [string]$TimestampServer = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SetupExe)) { throw "Arquivo não encontrado: $SetupExe" }

# pasta padrão dos certificados: installer\certs (coberta por certs/ no .gitignore)
if (-not $PfxPath) {
    $PfxPath = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "certs\onliacesso-codesign.pfx"
}
$certDir = Split-Path -Parent $PfxPath
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$securePw = ConvertTo-SecureString $PfxPassword -AsPlainText -Force

if (-not (Test-Path $PfxPath)) {
    Write-Host "Gerando certificado code-signing auto-assinado ($Subject) ..."
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Subject `
        -CertStoreLocation Cert:\CurrentUser\My `
        -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 3072 `
        -NotAfter (Get-Date).AddYears(5)
    Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $securePw | Out-Null
    Write-Host "Certificado exportado para $PfxPath"
} else {
    Write-Host "Reutilizando certificado existente: $PfxPath"
}

# X509Certificate2 direto do .pfx (Get-PfxCertificate -Password exige PS 7+)
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList @(
    $PfxPath, $PfxPassword,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)

Write-Host "Assinando $SetupExe ..."
$sig = Set-AuthenticodeSignature -FilePath $SetupExe -Certificate $cert `
    -HashAlgorithm SHA256 -TimestampServer $TimestampServer -ErrorAction Continue

if ($sig.Status -ne 'Valid' -and $sig.Status -ne 'UnknownError') {
    # timestamp server inacessível: assina sem carimbo de tempo (a assinatura
    # expira junto com o certificado, mas continua íntegra)
    Write-Warning "Falha com timestamp ($($sig.Status)); assinando sem carimbo de tempo..."
    $sig = Set-AuthenticodeSignature -FilePath $SetupExe -Certificate $cert -HashAlgorithm SHA256
}

$check = Get-AuthenticodeSignature -FilePath $SetupExe
Write-Host ("Assinatura: {0} (certificado: {1})" -f $check.Status, $check.SignerCertificate.Subject)
# Auto-assinado fora do repositório de confiança aparece como 'UnknownError'
# (cadeia não confiável) — esperado; o hash da assinatura continua válido.
if (-not $check.SignerCertificate) { throw "Assinatura não aplicada." }
Write-Host "OK."
