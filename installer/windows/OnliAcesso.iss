; OnliAcesso - Instalador Windows (Inno Setup 6)
; Compilado por installer/build-package.sh, que passa /DAppVersion=<versao do package.json raiz>

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef StageDir
  #define StageDir "stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\dist"
#endif

[Setup]
AppId={{8F2A1C64-0B7E-4D11-9A3F-6C2E51A0B7D3}
AppName=OnliAcesso
AppVersion={#AppVersion}
AppPublisher=OnliAcesso
AppPublisherURL=https://onliacesso.com.br
DefaultDirName=C:\OnliAcesso
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2/max
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=4
OutputDir={#OutputDir}
OutputBaseFilename=OnliAcessoSetup-{#AppVersion}
WizardStyle=modern
SetupLogging=yes
UninstallDisplayName=OnliAcesso - Sistema de Controle de Acesso

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
brazilianportuguese.WelcomeLabel1=Bem-vindo ao instalador do OnliAcesso
brazilianportuguese.WelcomeLabel2=Este assistente vai instalar o OnliAcesso %1 neste servidor.%n%nSerao instalados: PostgreSQL 16, Node.js 20, Nginx e os aplicativos do sistema (API, painel das portarias, interface administrativa e portal do morador).%n%nRecomenda-se fechar outros programas antes de continuar.

[Tasks]
Name: "desktopicon"; Description: "Criar icone na area de trabalho"; GroupDescription: "Icones adicionais:"

[Files]
; extraido em {tmp} para rodar ANTES da copia (destrava instalacao anterior)
Source: "{#StageDir}\scripts\cleanup.ps1"; Flags: dontcopy
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{commondesktop}\OnliAcesso - Painel"; Filename: "http://localhost/painel/"; Tasks: desktopicon
Name: "{autoprograms}\OnliAcesso\Painel das Portarias"; Filename: "http://localhost/painel/"
Name: "{autoprograms}\OnliAcesso\Administracao"; Filename: "http://localhost/admin/"
Name: "{autoprograms}\OnliAcesso\Portal do Morador"; Filename: "http://localhost/login/"
Name: "{autoprograms}\OnliAcesso\Credenciais geradas"; Filename: "{app}\config\credenciais.txt"

[Run]
Filename: "http://localhost/painel/"; Description: "Abrir o OnliAcesso no navegador"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall.ps1"" -TargetDir ""{app}"""; Flags: runhidden waituntilterminated; RunOnceId: "OnliAcessoUninstall"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\services"

[Code]
var
  ConfigPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  { Pagina extra: configuracao do condominio e da integracao HikCentral }
  ConfigPage := CreateInputQueryPage(wpWelcome,
    'Configuracao do Condominio',
    'Informe os dados basicos e, se houver, a integracao HikCentral',
    'O nome do condominio identifica esta instalacao. Os campos do HikCentral ' +
    'sao opcionais: deixe em branco para operar no modo local (standalone). ' +
    'Tudo pode ser alterado depois na interface administrativa.');
  ConfigPage.Add('Nome do condominio:', False);
  ConfigPage.Add('HikCentral - endereco IP (opcional):', False);
  ConfigPage.Add('HikCentral - App Key (opcional):', False);
  ConfigPage.Add('HikCentral - App Secret (opcional):', True);
  ConfigPage.Values[0] := 'Condominio';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (ConfigPage <> nil) and (CurPageID = ConfigPage.ID) then
  begin
    if Trim(ConfigPage.Values[0]) = '' then
    begin
      MsgBox('Informe o nome do condominio.', mbError, MB_OK);
      Result := False;
      exit;
    end;
    { HikCentral: ou preenche IP + chave + segredo, ou nada }
    if (Trim(ConfigPage.Values[1]) <> '') or (Trim(ConfigPage.Values[2]) <> '') or (Trim(ConfigPage.Values[3]) <> '') then
      if (Trim(ConfigPage.Values[1]) = '') or (Trim(ConfigPage.Values[2]) = '') or (Trim(ConfigPage.Values[3]) = '') then
      begin
        MsgBox('Para integrar com o HikCentral preencha IP, App Key e App Secret. Para modo local, deixe os tres em branco.', mbError, MB_OK);
        Result := False;
      end;
  end;
end;

{ Antes de copiar arquivos: para servicos e processos de instalacao anterior
  que estejam segurando arquivos na pasta de destino }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  ExtractTemporaryFile('cleanup.ps1');
  if not Exec('powershell.exe',
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}') + '\cleanup.ps1"' +
    ' -TargetDir "' + ExpandConstant('{app}') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := 'Nao foi possivel executar a limpeza da instalacao anterior (cleanup.ps1).';
  end;
end;

{ Pos-instalacao profissional: o install.ps1 roda OCULTO (sem console) e o
  progresso aparece numa pagina nativa do wizard. A comunicacao usa dois
  arquivos em %TEMP%: onliacesso-install-status.txt (etapa atual) e
  onliacesso-install-exit.txt (codigo de saida, sinaliza o termino). }
procedure CurStepChanged(CurStep: TSetupStep);
var
  Params, StatusFile, ExitFile: string;
  ResultCode, Waited, ExitCode: Integer;
  ProgressPage: TOutputMarqueeProgressWizardPage;
  FileText: AnsiString;
begin
  if CurStep = ssPostInstall then
  begin
    StatusFile := GetEnv('TEMP') + '\onliacesso-install-status.txt';
    ExitFile := GetEnv('TEMP') + '\onliacesso-install-exit.txt';
    DeleteFile(StatusFile);
    DeleteFile(ExitFile);

    Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}') + '\scripts\install.ps1"' +
      ' -SourceDir "' + ExpandConstant('{app}') + '"' +
      ' -TargetDir "' + ExpandConstant('{app}') + '"' +
      ' -CondoName "' + Trim(ConfigPage.Values[0]) + '"' +
      ' -HikIp "' + Trim(ConfigPage.Values[1]) + '"' +
      ' -HikAppKey "' + Trim(ConfigPage.Values[2]) + '"' +
      ' -HikAppSecret "' + Trim(ConfigPage.Values[3]) + '"' +
      ' -AppVersion "{#AppVersion}"';

    if not Exec('powershell.exe', Params, '', SW_HIDE, ewNoWait, ResultCode) then
    begin
      MsgBox('Nao foi possivel executar o script de configuracao (install.ps1).' + #13#10 +
        'Execute manualmente como Administrador: ' + ExpandConstant('{app}') + '\scripts\install.ps1', mbError, MB_OK);
      exit;
    end;

    ProgressPage := CreateOutputMarqueeProgressPage('Configurando o OnliAcesso',
      'Banco de dados, aplicativos e servicos estao sendo configurados. Isso pode levar alguns minutos.');
    ProgressPage.Show;
    try
      ProgressPage.SetText('Iniciando a configuracao...', '');
      Waited := 0;
      { ate 30 minutos; o install.ps1 sempre escreve o ExitFile ao terminar }
      while (not FileExists(ExitFile)) and (Waited < 1800000) do
      begin
        ProgressPage.Animate;
        Sleep(150);
        Waited := Waited + 150;
        if (Waited mod 900) < 150 then
          if LoadStringFromFile(StatusFile, FileText) then
            ProgressPage.SetText(Trim(String(FileText)), '');
      end;
    finally
      ProgressPage.Hide;
    end;

    if not FileExists(ExitFile) then
    begin
      MsgBox('A configuracao nao terminou dentro do tempo esperado (30 minutos).' + #13#10 +
        'Consulte o log em %TEMP%\onliacesso-install.log e execute novamente como Administrador:' + #13#10 +
        '  powershell -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}') + '\scripts\install.ps1"',
        mbError, MB_OK);
      exit;
    end;

    ExitCode := 1;
    if LoadStringFromFile(ExitFile, FileText) then
      ExitCode := StrToIntDef(Trim(String(FileText)), 1);
    if ExitCode <> 0 then
      MsgBox('A configuracao dos servicos falhou (codigo ' + IntToStr(ExitCode) + ').' + #13#10 + #13#10 +
        'Consulte o log em:' + #13#10 +
        '  ' + ExpandConstant('{app}') + '\logs\install.log' + #13#10 +
        '  %TEMP%\onliacesso-install.log' + #13#10 + #13#10 +
        'Apos corrigir, execute como Administrador:' + #13#10 +
        '  powershell -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}') + '\scripts\install.ps1"',
        mbError, MB_OK);
  end;
end;
