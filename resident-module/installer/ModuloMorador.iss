; Instalador do Módulo do Morador (HikCentral). Compilar com Inno Setup 6:
;   iscc /DAppVersion=0.1.0 ModuloMorador.iss   (ou via build-package.sh)
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{6D1F3A52-8C47-4E0B-9A7E-2B5C41D9E7A3}
AppName=Módulo do Morador (HikCentral)
AppVersion={#AppVersion}
AppPublisher=Onlitec
DefaultDirName={autopf}\ModuloMorador
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist
OutputBaseFilename=ModuloMoradorSetup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Módulo do Morador (HikCentral)

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Run]
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\setup.ps1"" -InstallDir ""{app}"" -HikHost ""{code:HikHost}"" -HikAppKey ""{code:HikKey}"" -HikAppSecret ""{code:HikSecret}"" -HikUserId ""{code:HikUser}"" -PublicUrl ""{code:PublicUrl}"" -Port ""{code:Port}"""; \
  StatusMsg: "Configurando e iniciando o serviço..."; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\remove.ps1"" -InstallDir ""{app}"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"

[Code]
var
  CfgPage: TInputQueryWizardPage;

function ConfigExists: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonappdata}\ModuloMorador\config\.env'));
end;

procedure InitializeWizard;
begin
  CfgPage := CreateInputQueryPage(wpSelectDir, 'Conexão com o HikCentral',
    'Informe os dados do OpenAPI do HikCentral',
    'Em atualizações, a configuração existente é mantida e estes campos são ignorados.');
  CfgPage.Add('Endereço do HikCentral (ex.: https://127.0.0.1 ou https://hik.condominio.com.br):', False);
  CfgPage.Add('Chave do parceiro de integração (AppKey):', False);
  CfgPage.Add('Segredo do parceiro de integração (AppSecret):', True);
  CfgPage.Add('Utilizador associado (ex.: admin):', False);
  CfgPage.Add('Endereço público HTTPS do módulo (ex.: https://morador.condominio.com.br):', False);
  CfgPage.Add('Porta local do módulo:', False);
  CfgPage.Values[3] := 'admin';
  CfgPage.Values[5] := '4100';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = CfgPage.ID) and ConfigExists;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = CfgPage.ID) and (not ConfigExists) then
    if (Trim(CfgPage.Values[0]) = '') or (Trim(CfgPage.Values[1]) = '') or (Trim(CfgPage.Values[2]) = '') then
    begin
      MsgBox('Endereço, AppKey e AppSecret do HikCentral são obrigatórios.', mbError, MB_OK);
      Result := False;
    end;
end;

function HikHost(Param: String): String;   begin Result := Trim(CfgPage.Values[0]); end;
function HikKey(Param: String): String;    begin Result := Trim(CfgPage.Values[1]); end;
function HikSecret(Param: String): String; begin Result := Trim(CfgPage.Values[2]); end;
function HikUser(Param: String): String;   begin Result := Trim(CfgPage.Values[3]); end;
function PublicUrl(Param: String): String; begin Result := Trim(CfgPage.Values[4]); end;
function Port(Param: String): String;      begin Result := Trim(CfgPage.Values[5]); end;
