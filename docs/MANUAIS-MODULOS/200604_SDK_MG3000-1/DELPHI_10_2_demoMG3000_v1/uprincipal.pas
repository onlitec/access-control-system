{
*****************************************************
********* NICE BRASIL - CONTROLE DE ACESSO **********
*                                                   *
* Software de apresentação dos principais comandos  *
* do Módulo Guarita MG3000                          *
*                                                   *
* Modificado em: 17/02/2020                         *
*                                                   *
*****************************************************
}
unit uprincipal;

interface

uses
  Winapi.Windows, Winapi.Messages, System.Variants, System.Classes,
  Vcl.Graphics, Vcl.Controls, Vcl.Forms, Vcl.Dialogs, Vcl.StdCtrls,
  System.StrUtils, Vcl.ComCtrls, Vcl.CheckLst, Vcl.ExtCtrls,
  System.Win.ScktComp, System.SysUtils;

type
  Tfprincipal = class(TForm)
    pcGuias: TPageControl;
    TabSheet1: TTabSheet;
    TabSheet2: TTabSheet;
    TabSheet3: TTabSheet;
    Label1: TLabel;
    edFrame: TEdit;
    GroupBox2: TGroupBox;
    Label2: TLabel;
    Label3: TLabel;
    Label4: TLabel;
    Label5: TLabel;
    Label6: TLabel;
    Label7: TLabel;
    Label8: TLabel;
    Label9: TLabel;
    lbTipo: TLabel;
    lbSerial: TLabel;
    lbDataHora: TLabel;
    lbDisp: TLabel;
    lbUnid: TLabel;
    lbBloco: TLabel;
    lbSaida: TLabel;
    lbBat: TLabel;
    GroupBox3: TGroupBox;
    Label11: TLabel;
    Label12: TLabel;
    Label13: TLabel;
    Label14: TLabel;
    Label15: TLabel;
    Label16: TLabel;
    Label17: TLabel;
    Label18: TLabel;
    Label19: TLabel;
    Label20: TLabel;
    Label21: TLabel;
    lbTipoD: TLabel;
    lbSerialD: TLabel;
    lbContaD: TLabel;
    lbUnidD: TLabel;
    lbBlocoD: TLabel;
    lbHabD: TLabel;
    lbLabelD: TLabel;
    lbAcionD: TLabel;
    lbBatD: TLabel;
    lbVeiculoD: TLabel;
    lsDisp: TListBox;
    btLerDisp: TButton;
    Label10: TLabel;
    lbQuantDisp: TLabel;
    GroupBox4: TGroupBox;
    Label24: TLabel;
    Label25: TLabel;
    cbDisp: TComboBox;
    cbCAN: TComboBox;
    cxEVT: TCheckBox;
    btR1: TButton;
    btR2: TButton;
    btR3: TButton;
    btR4: TButton;
    GroupBox1: TGroupBox;
    btLerRelogio: TButton;
    TabSheet4: TTabSheet;
    GroupBox5: TGroupBox;
    cbDisp2: TComboBox;
    edSerial: TEdit;
    edContador: TEdit;
    Label26: TLabel;
    lblSerial: TLabel;
    lblContador: TLabel;
    GroupBox6: TGroupBox;
    cbUnidade: TComboBox;
    cbBloco: TComboBox;
    Label29: TLabel;
    Label30: TLabel;
    Label31: TLabel;
    edIdentificacao: TEdit;
    GroupBox7: TGroupBox;
    cbMarcaV: TComboBox;
    cbCorV: TComboBox;
    edPlacaV: TEdit;
    Label32: TLabel;
    Label33: TLabel;
    Label34: TLabel;
    GroupBox8: TGroupBox;
    clRecs: TCheckListBox;
    btCadastrar: TButton;
    btAtualizar: TButton;
    toutCom: TTimer;
    csTCP: TClientSocket;
    edIP: TEdit;
    edPorta: TEdit;
    lbIP: TLabel;
    lbPort: TLabel;
    btConectar: TButton;
    btEnviarRelogio: TButton;
    Label35: TLabel;
    edWie1: TEdit;
    edWie2: TEdit;
    btConvWie: TButton;
    Label36: TLabel;
    lbGrupoD: TLabel;
    Label22: TLabel;
    cbGrupo: TComboBox;
    GroupBox9: TGroupBox;
    Label23: TLabel;
    btModoRemoto: TButton;
    btIdVago: TButton;
    btVincularDigital: TButton;
    toutComando57: TTimer;
    lblMsgDigital: TLabel;
    btApagarDisp: TButton;
    procedure FormCreate(Sender: TObject);
    procedure btConectarClick(Sender: TObject);
    procedure btLerDispClick(Sender: TObject);
    procedure lsDispClick(Sender: TObject);
    procedure btLerRelogioClick(Sender: TObject);
    procedure btR1Click(Sender: TObject);
    procedure btR2Click(Sender: TObject);
    procedure btR3Click(Sender: TObject);
    procedure btR4Click(Sender: TObject);
    procedure cbDisp2Change(Sender: TObject);
    procedure edSerialKeyPress(Sender: TObject; var Key: Char);
    procedure edContadorKeyPress(Sender: TObject; var Key: Char);
    procedure btCadastrarClick(Sender: TObject);
    procedure btAtualizarClick(Sender: TObject);
    procedure toutComTimer(Sender: TObject);
    procedure csTCPConnect(Sender: TObject; Socket: TCustomWinSocket);
    procedure csTCPError(Sender: TObject; Socket: TCustomWinSocket; ErrorEvent: TErrorEvent; var ErrorCode: Integer);
    procedure csTCPRead(Sender: TObject; Socket: TCustomWinSocket);
    procedure btEnviarRelogioClick(Sender: TObject);
    procedure FormClose(Sender: TObject; var Action: TCloseAction);
    procedure btConvWieClick(Sender: TObject);
    procedure edWie1KeyPress(Sender: TObject; var Key: Char);
    procedure edWie2KeyPress(Sender: TObject; var Key: Char);
    procedure btModoRemotoClick(Sender: TObject);
    procedure btIdVagoClick(Sender: TObject);
    procedure btVincularDigitalClick(Sender: TObject);
    procedure toutComando57Timer(Sender: TObject);
    procedure btApagarDispClick(Sender: TObject);
  private
    { Private declarations }
    procedure recepcaoResposta(frBytes: PByte; tamFrame: Integer);
  public
    { Public declarations }
  end;

type
  gpFeature = array[0..255] of Byte;  //"Feature" biometria ANVIZ
    
var
  fprincipal: Tfprincipal;

  //*Variáveis globais
  conta, qt_disp: Integer;

  gl_TemplNum: Integer;  // 1 = Dedo 1, 2 = Dedo 2/Pânico
  gl_FeatNum: Integer;   // 1 = Digital, 2 = Confirmação da Digital
  gl_idBioH: string;
  gl_TemplateH: array[1..2] of string;   // Raw Template (338 bytes)
  gl_Feature: array[1..2] of gpFeature;  // Raw Feature (169 bytes)

  //*Funções globais
  function IsWrongIP(ip: string): Boolean;

  function decimal(bits: string): Integer;
  function binario(hexa1byte: string): string;
  function hex2dec(hexa: string): Integer;

  function retorna_marcav(hexa1byte: string): string;
  function retorna_corv(hexa1byte: string): string;

  function cbDispTotipoDispHex(cb: Integer): string;
  
  procedure enviaComando(frameHex: string);
  procedure toutComando(habilita: Boolean; seg: Integer);

  //*Funções da DLL Anviz (LN-BIO - Hamster USB) - AvzScanner.dll
  function AvzMatch(pFeature1: gpFeature; pFeature2: gpFeature; level: Word; rotate: Word): Integer; stdcall; external 'AvzScanner.dll';

implementation

{$R *.dfm}

//**Função para verificar se Endereço IP é válido
function IsWrongIP(ip: string): Boolean;
var
        z: Integer;
        i: Byte;
        st: array[1..3] of Byte;
const
        ziff = ['0'..'9'];
begin
        st[1] := 0;
        st[2] := 0;
        st[3] := 0;
        z := 0;

        Result := False;

        for i:= 1 to Length(ip) do
        begin
         if (CharInSet(ip[i], ziff) = false) then
         begin
          if (ip[i] = '.') then
          begin
           Inc(z);

           if (z < 4) then
            st[z] := i
           else
           begin
            Result := True;
            Exit;
           end;
          end
          else
          begin
           Result := True;
           Exit;
          end;
         end;
        end;

        if (z <> 3) or (st[1] < 2) or (st[3] = Length(ip)) or (st[1] + 2 > st[2]) or
           (st[2] + 2 > st[3]) or (st[1] > 4) or (st[2] > st[1] + 4) or (st[3] > st[2] + 4) then
        begin
         Result := True;
         Exit;
        end;

        z := StrToInt(Copy(ip, 1, st[1] - 1));

        if (z > 255) or (ip[1] = '0') then
        begin
         Result := True;
         Exit;
        end;

        z := StrToInt(Copy(ip, st[1] + 1, st[2] - st[1] - 1));

        if (z > 255) or ((z <> 0) and (ip[st[1] + 1] = '0')) then
        begin
         Result := True;
         Exit;
        end;

        z:= StrToInt(copy(ip, st[2] + 1, st[3] - st[2] - 1));

        if (z > 255) or ((z <> 0) and (ip[st[2] + 1] = '0')) then
        begin
         Result := True;
         Exit;
        end;

        z := StrToInt(Copy(ip, st[3] + 1, Length(ip) - st[3]));

        if (z > 255) or ((z <> 0) and (ip[st[3] + 1] = '0')) then
        begin
         Result := True;
         Exit;
        end;
end;

//**Função para converter BINÁRIO para DECIMAL
function decimal(bits: string): Integer;
var
        i, multi: Integer;
begin
        multi := 1;
        Result := 0;

        for i:= Length(bits) downto 1 do
        begin
         Result := Result + StrToInt(Copy(bits,i,1)) * multi;
         multi := multi * 2;
        end;
end;

//**Função para converter HEXADECIMAL para BINÁRIO
function binario(hexa1byte: string): string;
var
        resto, quoc, deci: Integer;
        bina: string;
begin
        deci := hex2dec(hexa1byte);  //Converte HEXA para DECIMAL

        if (deci <> 0) then
        begin

         bina := '';

         while (deci <> 1) do
         begin
          resto := deci mod 2;
          quoc := deci div 2;
          bina := IntToStr(resto) + bina;
          deci := quoc;
         end;

         bina := IntToStr(deci) + bina;

         while (Length(bina) < 8) do
          bina := '0' + bina;  //Garante 8 bits preenchendo com '0' à esquerda
        end
        else
        begin  //8 bits zerados
         bina := '00000000';
        end;

        Result := bina;
end;

//**Função para converter HEXADECIMAL em DECIMAL
function hex2dec(hexa: string): Integer;
begin
        Result := StrToInt('$' + hexa);
end;

//**Retorna a marca do veículo
function retorna_marcav(hexa1byte: string): string;
begin
        case hex2dec(hexa1byte) of
         0: Result:= 'AUDI';
         1: Result:= 'BMW';
         2: Result:= 'CHEVROLET';
         3: Result:= 'CHRYSLER';
         4: Result:= 'CITROEN';
         5: Result:= 'FERRARI';
         6: Result:= 'FIAT';
         7: Result:= 'FORD';
         8: Result:= 'GM';
         9: Result:= 'HONDA';
         10: Result:= 'HYUNDAI';
         11: Result:= 'IMPORTADO';
         12: Result:= 'JAGUAR';
         13: Result:= 'JEEP';
         14: Result:= 'KIA';
         15: Result:= 'LAMBORGHINI';
         16: Result:= 'LAND ROVER';
         17: Result:= 'MAZDA';
         18: Result:= 'MERCEDES';
         19: Result:= 'MITSUBISHI';
         20: Result:= 'MOTO';
         21: Result:= 'NISSAN';
         22: Result:= 'VEICULO';
         23: Result:= 'PEUGEOT';
         24: Result:= 'PORSCHE';
         25: Result:= 'RENAULT';
         26: Result:= 'SUBARU';
         27: Result:= 'SUZUKI';
         28: Result:= 'TOYOTA';
         29: Result:= 'VOLKSWAGEN';
         30: Result:= 'VOLVO';
         31: Result:= 'SEM VEICULO';
        else
         Result:= 'EDITAVEL';
        end;
end;

//**Retorna a cor do veículo
function retorna_corv(hexa1byte: string): string;
begin
        case hex2dec(hexa1byte) of
         0: Result:= 'AMARELO';
         1: Result:= 'AZUL';
         2: Result:= 'BEGE';
         3: Result:= 'BRANCO';
         4: Result:= 'CINZA';
         5: Result:= 'DOURADO';
         6: Result:= 'FANTASIA';
         7: Result:= 'GRENA';
         8: Result:= 'LARANJA';
         9: Result:= 'MARROM';
         10: Result:= 'PRATA';
         11: Result:= 'PRETO';
         12: Result:= 'ROSA';
         13: Result:= 'ROXO';
         14: Result:= 'VERDE';
         15: Result:= 'VERMELHO';
        else
         Result:= '?';
        end;
end;

//**Retorna (em hexadecimal) o Tipo Disp. correspondente à seleção no ComboBox
function cbDispTotipoDispHex(cb: Integer): string;
begin
        case (cb) of
         0: Result := '01'; // Controle TX (RF)
         1: Result := '02'; // TAG Ativo (TA)
         2: Result := '03'; // Cartão (CT/CTW)
         3: Result := '05'; // Biometria (BM)
         4: Result := '06'; // TAG Passivo (TP/UHF)
         5: Result := '07'; // Senha (SN)
        end;
end;

//**Habilita/Desabilita rotina para Timeout de comandos
procedure toutComando(habilita: Boolean; seg: Integer);
begin
        fprincipal.toutCom.Enabled := False;

        fprincipal.toutCom.Enabled := habilita;
        fprincipal.toutCom.Interval := seg * 1000;
end;

//**Procedimento para envio de frame de comando "Nice", com cálculo de checksum
procedure enviaComando(frameHex: string);
var
        i, tamFrame: Integer;
        checksum: Byte;
        frameByte: array of Byte;
begin
        tamFrame := Length(frameHex) div 2;

        //Checksum apenas para frames acima de 2 bytes
        checksum := 0;
        if (tamFrame > 1) then
        begin
         for i:= 1 to tamFrame do
          checksum := checksum + hex2dec( Copy(frameHex,2*i-1,2) );

         frameHex := frameHex + IntToHex(checksum, 2);  //Inclui CS ao frame
         Inc(tamFrame);
        end;

        //Gera array de bytes para envio
        SetLength(frameByte, tamFrame);
        for i:= 0 to tamFrame-1 do
         frameByte[i] := hex2dec( Copy(frameHex,2*i+1,2) );

        //Envia para Socket TCP
        fprincipal.csTCP.Socket.SendBuf(frameByte[0], tamFrame);
end;

//**Procedimento de recepção Serial/TCP
procedure Tfprincipal.recepcaoResposta(frBytes: PByte; tamFrame: Integer);
var
        i, v_t_evt, v_rec_orig, matchRet: Integer;
        v_bits, v_frame: string;
        dados_h: array[0..2000-1] of string;
        vBool: Boolean;
begin
//Atribui valores ao vetor
        for i:= 0 to (tamFrame-1) do
        begin
         dados_h[i] := IntToHex(frBytes^,2);
         Inc(frBytes);
        end; 

//******************************
//4 - Envio automático de evento
//******************************
        if (dados_h[1] = '04') and (tamFrame = 20) then
        begin
         // Exibe frame no TEdit
         edFrame.Text := dados_h[2] + ' ';  // Contador de atualizações

         for i:= 1 to 16 do
          edFrame.Text := edFrame.Text + dados_h[2+i];  // <frame de evt. (16 bytes)>

         //*Interpretação dos bytes
         //+Tipo evento
         v_t_evt := hex2dec(dados_h[3][1]);

         //+Byte 11 (Alta) <receptor_origem>
         v_rec_orig := hex2dec(dados_h[13][1]);

         case (v_t_evt) of
          0: lbTipo.Caption := 'Dispositivo acionado';
          1: lbTipo.Caption := 'Passagem';
          2: lbTipo.Caption := 'Equipamento ligado';
          3: lbTipo.Caption := 'Desperta porteiro';
          4: lbTipo.Caption := 'Mudança de programação';
          5: lbTipo.Caption := 'Acionamento portaria';
          6: lbTipo.Caption := 'Acionamento PC';
          7: lbTipo.Caption := 'Receptores não atualizados';
          8: lbTipo.Caption := 'Tentativa de clonagem';
          9: lbTipo.Caption := 'Pânico';
          10: lbTipo.Caption := 'SD Card removido';
          11: lbTipo.Caption := 'Restore efetuado';
          12: lbTipo.Caption := 'Evento de receptor';
          13: lbTipo.Caption := 'Backup automático';
          14: lbTipo.Caption := 'Backup manual';
          15: lbTipo.Caption := 'Porteiro eletrônico';
         end;

         //+Serial do dispositivo
         if (v_t_evt in [0,8,9,12,15]) then
         begin

          if (v_rec_orig = 1) then // TX: Serial com 7 dígitos
           lbSerial.Caption := dados_h[3][2] + dados_h[4] + dados_h[5] + dados_h[6]
          else
           if (v_rec_orig = 3) and (dados_h[3][2] = '5') then  // BM no Rec. Modo CTWB: ID Digital (decimal)
           begin
            lbTipo.Caption := lbTipo.Caption + ' (BM)';
            lbSerial.Caption := Format('%.4d', [ hex2dec(dados_h[5]+dados_h[6]) ]);
           end
           else
            if (v_rec_orig = 3) and (dados_h[3][2] = '7') then  // SN no Rec. CTW: Senha (decimal)
            begin
             lbTipo.Caption:= lbTipo.Caption + ' (SN)';
             lbSerial.Caption := dados_h[4] + dados_h[5] + dados_h[6];
            end
            else
            begin  // Demais Disp.: Serial com 6 dígitos
             lbSerial.Caption := dados_h[4] + dados_h[5] + dados_h[6];
            end;

         end
         else
          lbSerial.Caption := '- - - -';

         //+Data e hora
         lbDataHora.Caption := dados_h[10] + '/' + dados_h[11] + '/' + dados_h[12];
         lbDataHora.Caption := lbDataHora.Caption + ' ' + dados_h[7] + ':' + dados_h[8] + ':' + dados_h[9];

         //+Dispositivo e End. CAN
         if (v_t_evt in [0,1,5,6,8,9,12,15]) then
         begin

          case v_rec_orig of
           1: lbDisp.Caption := 'Receptor TX';
           2: lbDisp.Caption := 'Receptor TAG Ativo';
           3: lbDisp.Caption := 'Receptor CT/CTW';
           6: lbDisp.Caption := 'Receptor TP/UHF';
          else
           lbDisp.Caption := 'Desconhecido'; 
          end;

          lbDisp.Caption := lbDisp.Caption + ' ' + IntToStr(hex2dec(dados_h[13][2]) + 1);  // End. CAN
         end
         else
          lbDisp.Caption := '- - - -';

         //+Unidade
         if (v_t_evt in [0,8,9]) then
          lbUnid.Caption := IntToStr(hex2dec(dados_h[14])*100 + hex2dec(dados_h[15]))
         else
          lbUnid.Caption := '- - - -';

         //+Bloco
         if (v_t_evt in [0,8,9]) then
         begin

          if (hex2dec(dados_h[16]) <= 25) then
           lbBloco.Caption := 'Bloco ' + Chr(hex2dec(dados_h[16]) + 65)  //Bloco em letras A ~ Z
          else
           lbBloco.Caption := 'Bloco ' + IntToStr(hex2dec(dados_h[16]) - 25);  //Blocos em números 1 ~ 230
         end
         else
          lbBloco.Caption := '- - - -';

         //+<flagsEvt0> (byte 15 - 7 6 54 3 210)
         v_bits := binario(dados_h[17]);  //Abre byte em 8 bits

          //+Saída (Relé)
          if (v_t_evt in [0,5,6,8,9,12,15]) then
           lbSaida.Caption := 'Saída ' + IntToStr(decimal(v_bits[3]+v_bits[4]) + 1)
          else
           lbSaida.Caption := '- - - -';

          //+Botoeira do Guarita (apenas evento tipo 5)
          if (v_t_evt = 5) then
           lbSaida.Caption := lbSaida.Caption + ' | Tecla ' + IntToStr(decimal(v_bits[6]+v_bits[7]+v_bits[8]) + 1); 

          //+Bateria (apenas TX e TA)
          if (v_t_evt in [0,9]) and ((v_rec_orig = 1) or (v_rec_orig = 2)) then
          begin

           if (v_bits[1] = '0') then
            lbBat.Caption := 'Bateria OK'
           else
            lbBat.Caption := 'Bateria FRACA';

          end
          else
           lbBat.Caption := '- - - -';

          //+Dupla passagem (apenas evento tipo 1)
          if (v_t_evt = 1) and (v_bits[5] = '1') then
          begin
           lbTipo.Caption := 'Dupla passagem';
          end;

         //+<flagsEvt1> (byte 16)
         case (v_t_evt) of
          0: begin  //Dispositivo acionado
           if (dados_h[18] = 'AA') then  //+Fora do Horário
            lbTipo.Caption := lbTipo.Caption + '(FH)';
          end;

          2: begin  //Equipamento ligado
           if ((dados_h[18] = 'E0') or (dados_h[18] = 'E1')) then  //+Nobreak Nice
            lbTipo.Caption := 'Nobreak Nice';
          end;

          3,9: begin  //Desperta porteiro ou Pânico
           if (dados_h[18] = 'FF') then  //+Evento não-atendido
            lbTipo.Caption := lbTipo.Caption + ' N.A.';
          end;

          4: begin  //Mudança de programação
           if (dados_h[18] = '55') then  //+Guarita Formatado (Zerado)
            lbTipo.Caption := 'Guarita formatado'
           else
            if (dados_h[18] = 'FF') then  //+Mud. Prog. por HTML
             lbTipo.Caption := lbTipo.Caption + ' HTML'
            else
             if (dados_h[18] = 'FE') then  //+Relógio Atualizado NTP
              lbTipo.Caption := 'Relógio Atualizado NTP'
          end;

          5: begin  //Acionamento portaria
           if (dados_h[18] = 'CC') then  //+Entrada Digital (Receptor)
            lbTipo.Caption := 'Entrada digital (Receptor)';
          end;

          6: begin  //Acionamento PC
           if (dados_h[18] = '37') then  //+Pânico Remoto
            lbTipo.Caption := 'Pânico remoto'
           else
            if (dados_h[18] = 'FF') then  //+Abertura Automática (Ctrl. Vaga)
             lbTipo.Caption := 'Abertura automática';
          end;

          10: begin  //SD Card removido
           if (dados_h[18] = 'FF') then  //+SD Card Cheio
            lbTipo.Caption := 'SD Card cheio';
          end;

          11: begin  //Restore efetuado
           if (dados_h[18] = '05') then  //+Restore na Bio Mestre Concluído
            lbTipo.Caption := 'Restore BM concluído';
          end;

          12: begin  //Evento de Receptor
           if (dados_h[18] = '00') then  //+Evento "TAG sem vaga"
            lbTipo.Caption := 'TAG sem vaga'
           else
            if (dados_h[18] = 'F9') then  //+Evento "Porta Violada"
             lbTipo.Caption := 'Porta violada'
            else
             if (dados_h[18] = 'FA') then  //+Evento "Porta Fechou"
              lbTipo.Caption := 'Porta fechou'
             else
              if (dados_h[18] = 'FB') then  //+Evento "Porta Abriu"
               lbTipo.Caption := 'Porta abriu'
              else
               if (dados_h[18] = 'FE') then  //+Evento "Falta D'Água"
                lbTipo.Caption := 'Nível reservatório'
               else
                if (dados_h[18] = 'FF') then  //+Evento "Porta Aberta"
                 lbTipo.Caption := 'Porta aberta';
          end;
         end;

         Exit;
        end;

//*****************************************
//7 - Ler número de dispositivos na memória
//*****************************************
        if (dados_h[1] = '07') and (tamFrame = 5) then
        begin
         toutComando(False, 1);

         Screen.Cursor := crDefault;

         qt_disp := hex2dec(dados_h[2] + dados_h[3]);

         lbQuantDisp.Caption := IntToStr(qt_disp);

         // Apenas faz leitura se realmente houver dispositivos cadastrados
         if (qt_disp > 0) then
         begin
          Screen.Cursor := crHourGlass;
          conta := 0;

          // Solicita primeiro dispositivo (Comando 70: 0x00 + 0x46 + <cs>)
          // Reposta de 42 bytes: 0x00 + 0x46 + <frame de disp. (39 bytes)> + <cs>
          toutComando(True, 5);
          enviaComando('0046');
         end;

         Exit;
        end;

//*************************
//11 - Escrever data e hora
//*************************
        if (dados_h[1] = '0B') and (tamFrame = 3) then
        begin
         toutComando(False, 1);
         
         Screen.Cursor := crDefault;

         ShowMessage('Data e Hora enviadas com sucesso!');

         Exit;
        end;

//********************
//12 - Ler data e hora
//********************
        if (dados_h[1] = '0C') and (tamFrame = 9) then
        begin
         toutComando(False, 1);
         
         Screen.Cursor := crDefault;

         //Mostra Data e Hora em MessageBox
         ShowMessage(dados_h[2]+'/'+dados_h[3]+'/'+dados_h[4]+ ' ' +dados_h[5]+':'+dados_h[6]+':'+dados_h[7]);

         Exit;
        end;

//*************************
//29 - Atualizar Receptores
//*************************
        if (dados_h[1] = '1D') and (tamFrame = 4) then
        begin
         toutComando(False, 1);
         
         Screen.Cursor := crDefault;

         if ( dados_h[2] = '00' ) then
          ShowMessage('Receptores Atualizados com sucesso!')
         else
          ShowMessage('Falha na Atualização dos Receptores!');

         Exit;
        end;

//***********************************************************
//42 - Dispositivo não cadastrado (em Menu > Cadastro Rápido)
//***********************************************************
        if (dados_h[1] = '2A') and (tamFrame = 11) then
        begin
         // ** Comando automático para TX, CT e TA não cadastrados, na tela "Cadastro Rápido" **
         vBool := True;

         //+Tipo Disp.
         case hex2dec(dados_h[2]) of
          $01: cbDisp2.ItemIndex := 0;  // TX
          $02: cbDisp2.ItemIndex := 1;  // TA
          $03: cbDisp2.ItemIndex := 2;  // CT
         else
          vBool := False;  // Disp. desconhecido!
         end;

         if ( vBool ) then
         begin
          cbDisp2.OnChange(Self);  // "Refresh"

          //+Serial (<serial_3> + <serial_2> + <serial_1> + <serial_0>)
          if ( dados_h[2] = '01' ) then
           edSerial.Text := dados_h[3][2] + dados_h[4] + dados_h[5] + dados_h[6]  // TX: Serial com 7 dígitos
          else
           edSerial.Text := dados_h[4] + dados_h[5] + dados_h[6];  // TA e CT: Serial com 6 dígitos

          //+Contador (<conta_h> + <conta_l>)
          edContador.Text := dados_h[7] + dados_h[8];

          //+Flags (bit3 -> Bateria / bits2..0 -> Botão)
          //v_bits := binario(dados_h[9]);
         end;

         Exit;
        end;

//**********************************************************
//46 - Dispositivo não cadastrado - RECEPTORES (CT, TA e TP)
//**********************************************************
        if (dados_h[1] = '2E') and (tamFrame = 10) then
        begin
         // ** Comando automático para CT, TA e TP não cadastrados, diretamente na Leitora do Receptor **
         vBool := True;

         //+Tipo Disp.
         case hex2dec(dados_h[2]) of
          $02: cbDisp2.ItemIndex := 1;  // TA
          $03: cbDisp2.ItemIndex := 2;  // CT
          $06: cbDisp2.ItemIndex := 4;  // TP
         else
          vBool := False;  // Disp. desconhecido!
         end;

         if ( vBool ) then
         begin
          cbDisp2.OnChange(Self);  // "Refresh"

          //+Endereço CAN (<num_disp>)
          //dados_h[3];

          //+Vago (0x00)
          //dados_h[4];

          //+Serial (<serial_2> + <serial_1> + <serial_0>)
          edSerial.Text := dados_h[5] + dados_h[6] + dados_h[7];

          //+Flags (bits2..0 -> Leitora)
          //v_bits := binario(dados_h[8]);
         end;

         Exit;
        end;

//*******************************************
//57 - Digital ANVIZ não cadastrada (Guarita)
//*******************************************
        if (dados_h[1] = '39') and ((tamFrame = 7) or (tamFrame = 174)) and (toutComando57.Enabled = True) then
        begin
         toutComando57.Enabled := False;

         if (tamFrame = 7) then
         begin
          // **Digital já cadastrada! Informa para qual ID...
          lblMsgDigital.Caption := 'Digital já cadastrada no ID ' + Format('%.4d', [ hex2dec(dados_h[4]+dados_h[5]) ]);

          Screen.Cursor := crDefault;
         end
         else
         begin
          // **Não cadastrada! Guarda feature de 169 bytes...
          for i := 0 to 168 do
          begin
           gl_TemplateH[ gl_TemplNum ] := gl_TemplateH[ gl_TemplNum ] + dados_h[ 4+i ];
           gl_Feature[ gl_FeatNum ][ i ] := hex2dec(dados_h[ 4+i ]);
          end;

          if (gl_TemplNum = 1) then
          begin
          
           if (gl_FeatNum = 1) then
           begin
            gl_FeatNum := 2;

            // #2. Solicita Confirmação da Digital 1 ao usuário
            lblMsgDigital.Caption := 'Confirme Dedo 1 na Bio. Mestre...';

            toutComando57.Enabled := True;
            enviaComando('0039');
           end
           else //if (gl_FeatNum = 2) then
           begin
            // #3. Verifica se Digital 1 e Confirmação conferem...
            //Matching level = 9 (máx.)
            //Mathing rotation angle = 60 graus (padrão)
            matchRet := AvzMatch(gl_Feature[1], gl_Feature[2], 9, 60);

            if (matchRet = 0) then
            begin  // Ok! Digitais compatíveis!
             gl_TemplNum := 2;
             gl_FeatNum := 1;

             // #4. Solicita Digital 2 ao usuário
             lblMsgDigital.Caption := 'Coloque Dedo 2 na Bio. Mestre...';

             toutComando57.Enabled := True;
             enviaComando('0039');
            end
            else
            begin  // Digitais não compatíveis...
             lblMsgDigital.Caption := 'Erro! Digitais não compatíveis!';

             Screen.Cursor := crDefault;
            end;
           end;

          end
          else //if (gl_TemplNum = 2) then
          begin

           if (gl_FeatNum = 1) then
           begin
            gl_FeatNum := 2;

            // #5. Solicita Confirmação da Digital 2 ao usuário
            lblMsgDigital.Caption := 'Confirme Dedo 2 na Bio. Mestre...';

            toutComando57.Enabled := True;
            enviaComando('0039');
           end
           else //if (gl_FeatNum = 2) then
           begin
            // #6. Verifica se Digital 2 e Confirmação conferem...
            //Matching level = 9 (máx.)
            //Mathing rotation angle = 60 graus (padrão)
            matchRet := AvzMatch(gl_Feature[1], gl_Feature[2], 9, 60);

            if (matchRet = 0) then
            begin  // Ok! Digitais compatíveis!
             // #7. Vincula efetivamente os 2 Templates (Raw - 338 bytes cada) ao ID do usuário...
             //Comando 74: 0x00 + 0x4A + <idBio_high> + <idBio_low> + <tamanhoTemplate_h> + <tamanhoTemplate_l> + <template> + <cs>
             //Resposta de 4 bytes: 0x00 + 0x4A + <resposta> + <cs>

             lblMsgDigital.Caption := 'Vinculando Digitais...';

             v_frame := gl_idBioH;  //<idBio_high> + <idBio_low>
             v_frame := v_frame + '02A4';  //<tamanhoTemplate_h> + <tamanhoTemplate_l>
             v_frame := v_frame + gl_TemplateH[1]+gl_TemplateH[2];  //<template>

             toutComando(True, 10);
             enviaComando('004A'+v_frame);
            end
            else
            begin  // Digitais não compatíveis...
             lblMsgDigital.Caption := 'Erro! Digitais não compatíveis!';

             Screen.Cursor := crDefault;
            end;
           end;
           
          end;
          //
         end;

         Exit;
        end;         

//*******************************
//59 -  Solicitar ID Digital vago
//*******************************
        if (dados_h[1] = '3B') and (tamFrame = 6) then
        begin
         toutComando(False, 1);

         Screen.Cursor := crDefault;

         if (dados_h[3] = 'FF') and (dados_h[4] = 'FF') then
          ShowMessage('Biometria cheia!')
         else
          edContador.Text := IntToStr( hex2dec(dados_h[3]+dados_h[4]) );

         Exit;
        end;

//****************************
//67/0 - Cadastrar dispositivo
//****************************
        if (dados_h[1] = '43') and (dados_h[2] = '00') and (tamFrame = 5) then
        begin
         toutComando(False, 1);

         Screen.Cursor := crDefault;

         case hex2dec(dados_h[3]) of
          $00: ShowMessage('Dispositivo cadastrado com sucesso!');
          $01: ShowMessage('Memória do Guarita cheia!');
          $02: ShowMessage('Dispositivo já existe na memória!');
          $FE: ShowMessage('Frame de cadastro inválido!');
         end;

         Exit;
        end;

//*************************
//67/4 - Apagar dispositivo
//*************************
        if (dados_h[1] = '43') and (dados_h[2] = '04') and (tamFrame = 5) then
        begin
         toutComando(False, 1);

         Screen.Cursor := crDefault;

         case hex2dec(dados_h[3]) of
          $00: begin
                ShowMessage('Dispositivo apagado com sucesso!');

                btLerDisp.Click;
               end;
          $03: ShowMessage('Dispositivo não encontrado!');
          $FE: ShowMessage('Frame inválido!');
         end;         

         Exit;
        end;

//***********************************
//70 - Ler dispositivos (PROGRESSIVO)
//***********************************
        if (dados_h[1] = '46') and (tamFrame = 42) then
        begin
         toutComando(False, 1);

         //Copia os 39 bytes do frame
         v_frame := '';
         for i:= 1 to 39 do
          v_frame := v_frame + dados_h[1+i];

         //Adiciona no "ListBox"
         lsDisp.Items.Add(v_frame);

         Inc(conta);

         if (conta = qt_disp) then
         begin  //Leitura terminada!
          enviaComando('002B');  // Cancelando timeout do Guarita (sem resposta)

          Screen.Cursor := crDefault;
          
          ShowMessage('Leitura finalizada!');
         end
         else
         begin  //Solicita próximo frame!
          // Apenas enviar 0x00 para solicitar o próximo frame
          toutComando(True, 5);
          enviaComando('00');
         end;

         Exit;
        end;

//***************************************
//74 - Vincular Digital ANVIZ (Biometria)
//***************************************
        if (dados_h[1] = '4A') and (tamFrame = 4) then
        begin
         toutComando(False, 1);

         Screen.Cursor := crDefault;

         lblMsgDigital.Caption := '- - - -';

         case hex2dec(dados_h[2]) of
          $00: ShowMessage('Digitais vinculadas com sucesso!');
          $03: ShowMessage('ERRO: ID não encontrado!');
          $04: ShowMessage('ERRO: Sem resposta da Bio. Mestre!');
          $05: ShowMessage('ERRO: ID inválido!');          
          $FE: ShowMessage('ERRO: Frame de digital inválido!');
          $FF: ShowMessage('ERRO: Tamanho do Frame Digital inválido!');
         end;

         Exit;
        end;
end;

procedure Tfprincipal.FormCreate(Sender: TObject);
var
        i: Integer;
begin
        //Lista Unidades (0 a 9999)
        for i:= 0 to 9999 do
         cbUnidade.Items.Add(IntToStr(i));
        cbUnidade.ItemIndex := 0;

        //Lista Blocos (A a Z, 1 a 230)
        for i:= 0 to 25 do
         cbBloco.Items.Add(Chr(i+65));
        for i:= 26 to 255 do
         cbBloco.Items.Add(IntToStr(i-25));
        cbBloco.ItemIndex := 0;

        //Lista Marcas de veículo
        for i:= 0 to 31 do
         cbMarcaV.Items.Add( retorna_marcav(IntToHex(i,2)) );
        cbMarcaV.ItemIndex := 31; 

        //Lista Cores de veículo
        for i:= 0 to 15 do
         cbCorV.Items.Add( retorna_corv(IntToHex(i,2)) );
        cbCorV.ItemIndex := 0;

        //Lista Grupos
        for i:= 0 to 15 do
         cbGrupo.Items.Add(IntToStr(i));
        cbGrupo.ItemIndex := 0;

        pcGuias.TabIndex := 0;
end;

procedure Tfprincipal.toutComTimer(Sender: TObject);
begin
// ************************
// ** TIMEOUT DE COMANDO **
//*************************
        toutCom.Enabled := False;

        Screen.Cursor := crDefault;

        ShowMessage('SEM RESPOSTA do comando!');
end;

procedure Tfprincipal.btConectarClick(Sender: TObject);
begin
//Iniciar ou Terminar conexão Serial/TCP
        if (btConectar.Caption = 'Conectar') then
        begin  //Conecta

         csTCP.Close;

         // IP digitado é válido?
         if IsWrongIP(edIP.Text) then
         begin
            // Não
          ShowMessage('Endereço IP inválido!');
         end
         else
         begin
            // Sim, tenta criar socket
          Screen.Cursor := crHourGlass;

          csTCP.Host := edIP.Text;
          csTCP.Port := StrToIntDef(edPorta.Text,0);
          csTCP.Open;
         end;
         
        end
        else
        begin  //Desconecta

         toutComando(False, 1);
         Screen.Cursor := crDefault;

         csTCP.Close;

         pcGuias.Visible := False;
         GroupBox1.Enabled := True;
         btConectar.Caption := 'Conectar';
        end;
end;

procedure Tfprincipal.csTCPConnect(Sender: TObject; Socket: TCustomWinSocket);
begin
// TCP: Socket criado com sucesso!
        btConectar.Caption := 'Desconectar';
        GroupBox1.Enabled := False;
        pcGuias.Visible := True;

        Screen.Cursor := crDefault;
end;

procedure Tfprincipal.csTCPError(Sender: TObject; Socket: TCustomWinSocket; ErrorEvent: TErrorEvent; var ErrorCode: Integer);
var
        cod: Integer;
begin
// TCP: Erro!
        toutComando(False, 1);
        Screen.Cursor := crDefault;
        
        cod := ErrorCode;
        ErrorCode := 0;

        ShowMessage('Erro de Socket. Código: ' + IntToStr(cod));
end;

procedure Tfprincipal.csTCPRead(Sender: TObject; Socket: TCustomWinSocket);
var
        qt: Integer;
        d: array of Byte;
begin
// TCP: Evento de recepção
        qt := Socket.ReceiveLength;

        if (qt > 0) then
        begin
         SetLength(d, qt);
         Socket.ReceiveBuf(d[0], qt);

         recepcaoResposta(@d[0], qt);
        end; 
end;

procedure Tfprincipal.btLerDispClick(Sender: TObject);
begin
// Botão "Ler dispositivos"

//Solicita quantidade (Comando 7: 0x00 + 0x07 + <cs>)
        Screen.Cursor := crHourGlass;

        lsDisp.Clear;  //Limpa lista

        //Resposta de 5 bytes: 0x00 + 0x07 + <quant. parte alta> + <quant. parte baixa> + <cs>
        toutComando(True, 5);
        enviaComando('0007');
end;

procedure Tfprincipal.lsDispClick(Sender: TObject);
var
        frame_disp, v_bits, v_str: string;
        dados_h: array [0..38] of string;
        i, tipoDisp: Integer;
begin
//*Ao selecionar frame na lista, exibe as informações sobre o dispositivo
        frame_disp := lsDisp.Items.Strings[lsDisp.ItemIndex];

//Separando os bytes
        for i:= 1 to 39 do
         dados_h[i-1] := Copy(frame_disp, 2*i-1, 2);

        //*Interpretando os bytes*
        //+Tipo disp.
        tipoDisp := hex2dec(dados_h[0][1]);        
        case (tipoDisp) of
         1: lbTipoD.Caption := 'Controle';
         2: lbTipoD.Caption := 'TAG Ativo';
         3: begin
             if ( dados_h[4] + dados_h[5] = '5649' ) then
              lbTipoD.Caption := 'CT Visitante'
             else
              lbTipoD.Caption := 'Cartão';
            end;
         5: lbTipoD.Caption := 'Biometria';
         6: lbTipoD.Caption := 'TAG Passivo';
         7: lbTipoD.Caption := 'Senha';
        end;

        //+Serial
        if (tipoDisp = 1) then
         lbSerialD.Caption := dados_h[0][2] + dados_h[1] + dados_h[2] + dados_h[3]  // TX: Serial com 7 dígitos
        else
         if (tipoDisp = 5) then
          lbSerialD.Caption := '- - - -'  // BM: Serial não utilizado!
         else
          lbSerialD.Caption := dados_h[1] + dados_h[2] + dados_h[3];  // Demais Disp.: Serial com 6 dígitos

        //+Contador de acionamentos (apenas TX e Biometria - ID Digital)
        if (tipoDisp = 1) then
         lbContaD.Caption := dados_h[4] + dados_h[5]
        else
         if (tipoDisp = 5) then
          lbContaD.Caption := Format('%.4d', [ hex2dec(dados_h[4]+dados_h[5]) ])
         else
          lbContaD.Caption := '- - - -';

        //+Unidade
        lbUnidD.Caption := IntToStr(hex2dec(dados_h[6])*100 + hex2dec(dados_h[7]));

        //+Bloco
        if (hex2dec(dados_h[8]) <= 25) then
         lbBlocoD.Caption := Chr(hex2dec(dados_h[8]) + 65)  //Bloco em letras A ~ Z
        else
         lbBlocoD.Caption := IntToStr(hex2dec(dados_h[8]) - 25);  //Blocos em números 1 ~ 230

        //+Grupo (apenas para Receptor Multifunção 4A)
        lbGrupoD.Caption := IntToStr( hex2dec(dados_h[9]) );

        //+Habilitações (REC 8..REC 1)
        v_bits := binario(dados_h[10]);

        lbHabD.Caption:= '';
        for i:= 1 to 8 do
        begin
         if (v_bits[9-i] = '1') then
          lbHabD.Caption := lbHabD.Caption + IntToStr(i) + ' ';
        end;

        //+Identificação (18 caracteres)
        lbLabelD.Caption := '';

        for i:= 1 to 18 do
         lbLabelD.Caption := lbLabelD.Caption + Chr(hex2dec(dados_h[10+i]));

        //+Flags (byte 30 = 7 654 3210)
        v_bits := binario(dados_h[29]);

         //++Dispositivo Portaria - apenas Biometria (bit 7)
         //v_bits[1];

         //++Último acionamento (bits 6..4)
         lbAcionD.Caption := IntToStr(decimal(v_bits[2]+v_bits[3]+v_bits[4]));

         //++Status Bateria (bits 3..0 -> 0 = Boa, F = Ruim) apenas TX e TA
         if ((tipoDisp = 1) or (tipoDisp = 2)) then
          lbBatD.Caption := IntToStr(decimal(v_bits[5]+v_bits[6]+v_bits[7]+v_bits[8]))
         else
          lbBatD.Caption := '- - - -';

        //+Veículo
         //++Marca
         lbVeiculoD.Caption := retorna_marcav(dados_h[30]);

         if (dados_h[30] <> '1F') then
         begin
          //++Cor do veículo (se aplicável -> '1F' = SEM VEICULO)
          lbVeiculoD.Caption := lbVeiculoD.Caption +' | '+ retorna_corv(dados_h[31]);

          //++Placa do veículo (se aplicável -> '1F' = SEM VEICULO)
          v_str := '';
          for i:= 1 to 7 do
           v_str := v_str + Chr(hex2dec(dados_h[31+i]));

          lbVeiculoD.Caption := lbVeiculoD.Caption +' | '+ v_str; 
         end;
end;

procedure Tfprincipal.btLerRelogioClick(Sender: TObject);
begin
// Botão "Ler Data e Hora"

//Comando 12: 0x00 + 0x0C + <cs>

        Screen.Cursor := crHourGlass;

        //Resposta de 9 bytes: 0x00 + 0x0C + <dia> + <mes> + <ano> + <hora> + <min> + <seg> + <cs>
        toutComando(True, 3);
        enviaComando('000C');
end;

procedure Tfprincipal.btEnviarRelogioClick(Sender: TObject);
var
        frame_hex: string;
begin
// Botão "Enviar Data e Hora"
                                           
//Comando 11: 0x00 + 0x0B + <dia> + <mês> + <ano> + <hora> + <min.> + <seg.> + <cs>

         Screen.Cursor := crHourGlass;

         frame_hex := '';

         frame_hex := frame_hex + FormatDateTime('dd',Now);
         frame_hex := frame_hex + FormatDateTime('mm',Now);
         frame_hex := frame_hex + FormatDateTime('yy',Now);
         frame_hex := frame_hex + FormatDateTime('hh',Now);
         frame_hex := frame_hex + FormatDateTime('nn',Now);
         frame_hex := frame_hex + FormatDateTime('ss',Now);

         //Resposta de 3 bytes: 0x00 + 0x0B + <cs>
         toutComando(True, 3);
         enviaComando('000B'+frame_hex);
end;

procedure Tfprincipal.btR1Click(Sender: TObject);
var
        frame_hex: string;
begin
//Acionamento Relé 1 - RECEPTOR

        frame_hex := '';

        //+Dispositivo
        frame_hex := frame_hex + cbDispTotipoDispHex(cbDisp.ItemIndex);
        //+CAN
        frame_hex := frame_hex + IntToHex(cbCAN.ItemIndex,2);
        //+Relé (Saída)
        frame_hex := frame_hex + '01';

        //+Gera eventos
        if (cxEVT.Checked) then
         frame_hex := frame_hex + '01'  //Gera evento - Comando 4
        else
         frame_hex := frame_hex + '00';  //Não gera evento

        //Envio (Comando 13 - 0x00 + 0x0D + <tipo_disp> + <num_disp> + <num_saida> + <gera_evt> + <cs>)
        //Sem resposta do Guarita
        enviaComando('000D'+frame_hex);
end;

procedure Tfprincipal.btR2Click(Sender: TObject);
var
        frame_hex: string;
begin
//Acionamento Relé 2 - RECEPTOR

        frame_hex := '';

        //+Dispositivo
        frame_hex := frame_hex + cbDispTotipoDispHex(cbDisp.ItemIndex);
        //+CAN
        frame_hex := frame_hex + IntToHex(cbCAN.ItemIndex,2);
        //+Relé (Saída)
        frame_hex := frame_hex + '02';

        //+Gera eventos
        if (cxEVT.Checked) then
         frame_hex := frame_hex + '01'  //Gera evento - Comando 4
        else
         frame_hex := frame_hex + '00';  //Não gera evento

        //Envio (Comando 13 - 0x00 + 0x0D + <tipo_disp> + <num_disp> + <num_saida> + <gera_evt> + <cs>)
        //Sem resposta do Guarita
        enviaComando('000D'+frame_hex);
end;

procedure Tfprincipal.btR3Click(Sender: TObject);
var
        frame_hex: string;
begin
//Acionamento Relé 3 - RECEPTOR

        frame_hex := '';

        //+Dispositivo
        frame_hex := frame_hex + cbDispTotipoDispHex(cbDisp.ItemIndex);
        //+CAN
        frame_hex := frame_hex + IntToHex(cbCAN.ItemIndex,2);
        //+Relé (Saída)
        frame_hex := frame_hex + '03';

        //+Gera eventos
        if (cxEVT.Checked) then
         frame_hex := frame_hex + '01'  //Gera evento - Comando 4
        else
         frame_hex := frame_hex + '00';  //Não gera evento

        //Envio (Comando 13 - 0x00 + 0x0D + <tipo_disp> + <num_disp> + <num_saida> + <gera_evt> + <cs>)
        //Sem resposta do Guarita
        enviaComando('000D'+frame_hex);
end;

procedure Tfprincipal.btR4Click(Sender: TObject);
var
        frame_hex: string;
begin
//Acionamento Relé 4 - RECEPTOR

        frame_hex := '';

        //+Dispositivo
        frame_hex := frame_hex + cbDispTotipoDispHex(cbDisp.ItemIndex);
        //+CAN
        frame_hex := frame_hex + IntToHex(cbCAN.ItemIndex,2);
        //+Relé (Saída)
        frame_hex := frame_hex + '04';

        //+Gera eventos
        if (cxEVT.Checked) then
         frame_hex := frame_hex + '01'  //Gera evento - Comando 4
        else
         frame_hex := frame_hex + '00';  //Não gera evento

        //Envio (Comando 13 - 0x00 + 0x0D + <tipo_disp> + <num_disp> + <num_saida> + <gera_evt> + <cs>)
        //Sem resposta do Guarita
        enviaComando('000D'+frame_hex);
end;

procedure Tfprincipal.cbDisp2Change(Sender: TObject);
begin
{
        - Tipo Disp. CONTROLE  --> SERIAL com 7 dígitos e CONTADOR utilizado;
        - Tipo Disp. BIOMETRIA --> SERIAL vago e CONTADOR usado como ID DIGITAL (decimal);
        - Tipo Disp. SENHA     --> SERIAL usado como SENHA (decimal) e CONTADOR vago;
        - Demais Tipo Disp.    --> SERIAL com 6 dígitos e CONTADOR vago.
}
        lblSerial.Enabled := True;
        lblSerial.Caption := 'Serial (hexa):';
        edSerial.Enabled := True;
        edSerial.Clear;
        edSerial.MaxLength := 6;

        lblContador.Enabled := True;
        lblContador.Caption := 'Contador (hexa):';
        edContador.Enabled := True;
        edContador.Clear;

        btIdVago.Enabled := False;
        btConvWie.Enabled := True;
        btVincularDigital.Enabled := False;

        if ( cbDispTotipoDispHex(cbDisp2.ItemIndex) = '01' ) then
        begin
         edSerial.MaxLength := 7;

         btConvWie.Enabled := False;
        end
        else
         if ( cbDispTotipoDispHex(cbDisp2.ItemIndex) = '05' ) then
         begin
          lblSerial.Enabled := False;
          edSerial.Text := '000000';
          edSerial.Enabled := False;

          lblContador.Caption := 'ID (dec):';

          btIdVago.Enabled := True;
          btConvWie.Enabled := False;
          btVincularDigital.Enabled := True;
         end
         else
          if ( cbDispTotipoDispHex(cbDisp2.ItemIndex) = '07' ) then
          begin
           lblSerial.Caption := 'Senha (dec):';

           lblContador.Enabled := False;
           edContador.Text := '0000';
           edContador.Enabled := False;

           btConvWie.Enabled := False;
          end
          else
          begin
           lblContador.Enabled := False;
           edContador.Text := '0000';
           edContador.Enabled := False;
          end;
end;

procedure Tfprincipal.edSerialKeyPress(Sender: TObject; var Key: Char);
begin
        if ( cbDispTotipoDispHex(cbDisp2.ItemIndex) = '07' ) then
        begin  //Dispositivo tipo SENHA
         //Somente números
         if not((Ord(Key) in [0..31]) or (Ord(Key) in [48..57])) then
          Key := #0;
        end
        else
        begin  //Demais dispositivos
         //Somente caracteres hexadecimal
         if not((Ord(Key) in [0..31]) or (Ord(Key) in [48..57]) or (Ord(Key) in [65..70]) or (Ord(Key) in [97..102])) then
          Key := #0;
        end;
end;

procedure Tfprincipal.edContadorKeyPress(Sender: TObject; var Key: Char);
begin
        if ( cbDispTotipoDispHex(cbDisp2.ItemIndex) = '05' ) then
        begin  //Dispositivo tipo BIOMETRIA
         //Somente números
         if not((Ord(Key) in [0..31]) or (Ord(Key) in [48..57])) then
          Key := #0;
        end
        else
        begin  //Demais dispositivos
         //Somente caracteres hexadecimal
         if not((Ord(Key) in [0..31]) or (Ord(Key) in [48..57]) or (Ord(Key) in [65..70]) or (Ord(Key) in [97..102])) then
          Key := #0;
        end;
end;

procedure Tfprincipal.edWie1KeyPress(Sender: TObject; var Key: Char);
begin
        //Somente números
        if not((Ord(Key) in [0..31]) or (Ord(Key) in [48..57])) then
         Key := #0;
end;

procedure Tfprincipal.edWie2KeyPress(Sender: TObject; var Key: Char);
begin
        //Somente números
        if not((Ord(Key) in [0..31]) or (Ord(Key) in [48..57])) then
         Key := #0;
end;

procedure Tfprincipal.btCadastrarClick(Sender: TObject);
var
        frame_hex, t_disp_l, vStr, vBits: string;
        vSerial, vContador: string;
        i: Integer;
begin
// Botão "CADASTRAR" (aba "Cadastrar Dispositivo")

        // Completa SERIAL com zeros à esquerda...
        while (Length(edSerial.Text) < edSerial.MaxLength) do
         edSerial.Text := '0' + edSerial.Text;

        vSerial := edSerial.Text;

        // Completa CONTADOR com zeros à esquerda...
        while (Length(edContador.Text) < 4) do
         edContador.Text := '0' + edContador.Text;

        vContador := edContador.Text;

        // <tipo_disp>
        vStr := cbDispTotipoDispHex(cbDisp2.ItemIndex);
        t_disp_l := vStr[2];

        //Verifica se SERIAL é válido e não-nulo (para disp. não-BIOMETRIA)
        //Verifica se CONTADOR é válido e não-nulo (para disp. BIOMETRIA)
        if ((t_disp_l <> '5') and (StrToIntDef('$'+vSerial,0) <> 0)) or
           ((t_disp_l = '5') and (StrToIntDef(vContador,0) <> 0)) then
        begin
         // Tudo certo! Gerando <frame de disp. (39 bytes)>...
         Screen.Cursor := crHourGlass;
         frame_hex := '';

         //+Byte 1
         frame_hex := frame_hex + t_disp_l;
         //Se <tipo_disp> igual a BIOMETRIA ou SENHA, nibble low (<disp_dest>) será igual a '3' (destino: CTW/CTWB)
         //Se <tipo_disp> igual a CONTROLE (TX), nibble low será o primeiro dígito do SERIAL
         //Demais <tipo_disp>, nibble low será igual a '0'
         if (t_disp_l = '5') or (t_disp_l = '7') then
          frame_hex := frame_hex + '3'
         else
          if (t_disp_l = '1') then
           frame_hex := frame_hex + vSerial[1]
          else
           frame_hex := frame_hex + '0';

         //+Bytes 2, 3 e 4
         frame_hex := frame_hex + AnsiRightStr(vSerial,6);

         //+Bytes 5 e 6
         //Se <tipo_disp> igual a BIOMETRIA, converter "vContador" para Hexadecimal (<idBio_high> e <idBio_low>)
         if (t_disp_l = '5') then
          frame_hex := frame_hex + IntToHex( StrToInt(vContador), 4 )
         else
          frame_hex := frame_hex + vContador;

         //+Byte 7
         vStr := Format('%.4d', [cbUnidade.ItemIndex]);  // Força UNIDADE com 4 dígitos (zeros à esquerda)

         frame_hex := frame_hex + IntToHex(StrToInt(vStr[1]+vStr[2]),2);  //<unid_h>

         //+Byte 8
         frame_hex := frame_hex + IntToHex(StrToInt(vStr[3]+vStr[4]),2);  //<unid_h>

         //+Byte 9
         frame_hex := frame_hex + IntToHex(cbBloco.ItemIndex,2);

         //+Byte 10
         frame_hex := frame_hex + IntToHex(cbGrupo.ItemIndex,2);

         //+Byte 11
         vBits := '';
         for i:= 0 to 7 do
         begin
          if ( clRecs.Checked[i] ) then
           vBits := '1' + vBits
          else
           vBits := '0' + vBits;
         end;

         frame_hex := frame_hex + IntToHex(decimal(vBits),2);

         //+Bytes 12 a 29
         vStr := edIdentificacao.Text;
         while (Length(vStr) < 18) do
          vStr := vStr + ' ';  // Completa com ESPAÇOS à direita

         for i:= 1 to 18 do
          frame_hex := frame_hex + IntToHex(Ord(vStr[i]),2);

         //+Byte 30
         frame_hex := frame_hex + '00';  //Apenas LEITURA!

         //+Byte 31
         frame_hex := frame_hex + IntToHex(cbMarcaV.ItemIndex,2);

         //+Byte 32
         frame_hex := frame_hex + IntToHex(cbCorV.ItemIndex,2);

         //+Bytes 33 a 39
         vStr := edPlacaV.Text;
         while (Length(vStr) < 7) do
          vStr := vStr + ' ';  // Completa com ESPAÇOS à direita

         for i:= 1 to 7 do
          frame_hex := frame_hex + IntToHex(Ord(vStr[i]),2);

         // Cadastrar dispositivo (Comando 67: 0x00 + 0x43 + 0x00 + <frame de disp. (39 bytes)> + <cs>)
         // Resposta de 5 bytes: 0x00 + 0x43 + 0x00 + <resposta> + <cs>
         toutComando(True, 5);
         enviaComando('004300'+frame_hex);
        end
        else
         ShowMessage('Campo SERIAL/SENHA/ID inválido!');
end;

procedure Tfprincipal.btAtualizarClick(Sender: TObject);
begin
// Botão "ATUALIZAR RECEPTORES" (aba "Cadastrar Dispositivo")

//Comando 29: 0x00 + 0x1D + <cs>
        Screen.Cursor := crHourGlass;

        // Resposta de 4 bytes: 0x00 + 0x1D + <resposta> + <cs>
        //Nota: Tempo de resposta depende da quantidade de dispositivos
        //a serem enviados aos Receptores!
        toutComando(True, 180);
        enviaComando('001D');
end;

procedure Tfprincipal.btConvWieClick(Sender: TObject);
var
        ser_h, ser_l: string;
begin
// Botão "CONVERTER" (Wiegand para Serial) - (aba "Cadastrar Dispositivo")

        //Força 3 e 5 dígitos nos campos
        while (Length(edWie1.Text) < 3) do
         edWie1.Text := '0' + edWie1.Text;

        while (Length(edWie2.Text) < 5) do
         edWie2.Text := '0' + edWie2.Text;

        ser_h := RightStr(IntToHex(StrToInt(edWie1.Text),2),2);

        ser_l := RightStr(IntToHex(StrToInt(edWie2.Text),4),4);

        edSerial.Text := ser_h + ser_l;
end;

procedure Tfprincipal.FormClose(Sender: TObject; var Action: TCloseAction);
begin
        toutComando(False, 1);
        Screen.Cursor := crDefault;

        csTCP.Close;
end;

procedure Tfprincipal.btModoRemotoClick(Sender: TObject);
begin
// Botão "ATIVAR (Modo Remoto)" (aba "Acionar Saídas")

//Comando 35: 0x00 + 0x23 + <tipo_disp> + <num_disp> + <cs>
        //+Dispositivo (TODOS)
        //+CAN (TODOS)

        //Sem resposta do Guarita
        enviaComando('0023FFFF');

        ShowMessage('Comando enviado! Verifique o LED INDICADOR DE STATUS dos Receptores!');
end;

procedure Tfprincipal.btIdVagoClick(Sender: TObject);
begin
// Botão "ID VAGO" (aba "Cadastrar Dispositivo")

//Comando 59: 0x00 + 0x3B + 0x00 + 0x00 + <cs>
        Screen.Cursor := crHourGlass;

        // Resposta de 6 bytes: 0x00 + 0x3B + 0x00 + <idBio_high> + <idBio_low> + <cs>
        toutComando(True, 5);
        enviaComando('003B0000');
end;

procedure Tfprincipal.btVincularDigitalClick(Sender: TObject);
begin
// Botão "VINCULAR DIGITAL" (aba "Cadastrar Dispositivo")
        lblMsgDigital.Caption := '- - - -';
        toutComando57.Enabled := False;

        gl_TemplateH[1] := '';
        gl_TemplateH[2] := '';

        // Completa CONTADOR com zeros à esquerda...
        while (Length(edContador.Text) < 4) do
         edContador.Text := '0' + edContador.Text;

        // Verifica se ID é válido e não-nulo...
        if (StrToIntDef(edContador.Text,0) <> 0) then
        begin
         Screen.Cursor := crHourGlass;

         // "edContador" para Hexadecimal (<idBio_high> e <idBio_low>)
         gl_idBioH := IntToHex( StrToInt(edContador.Text), 4 );

         // #1. Solicita Digital 1 ao usuário
         gl_TemplNum := 1;
         gl_FeatNum := 1;
         //Comando 57: 0x00 + 0x39 + <cs>
         //Resposta de 174 bytes: 0x00 + 0x39 + 0x00 + 0xA9 + <template 169 bytes> + <cs>
         //ou
         //Resposta de 7 bytes: 0x00 + 0x39 + 0x00 + 0x00 + <idBio_high> + <idBio_low> + <cs>

         lblMsgDigital.Caption := 'Coloque Dedo 1 na Bio. Mestre...';

         toutComando57.Interval := 10*1000;  //10 s
         toutComando57.Enabled := True;

         enviaComando('0039');
        end
        else
         ShowMessage('Campo ID inválido!');
end;

procedure Tfprincipal.toutComando57Timer(Sender: TObject);
begin
// TIMEOUT de "Vincular Digital" (aba "Cadastrar Dispositivo")
        toutComando57.Enabled := False;
        Screen.Cursor := crDefault;

        lblMsgDigital.Caption := 'TIMEOUT captura!';
end;

procedure Tfprincipal.btApagarDispClick(Sender: TObject);
var
        frame_hex, frame_disp: string;
begin
// Botão "Apagar Dispositivo"
        if (lsDisp.ItemIndex < 0) then exit;

        if (Application.MessageBox('Deseja apagar do Guarita o dispositivo selecionado?','Apagar Dispositivo',MB_ICONQUESTION or MB_YESNO) = IDNO) then Exit;

        //+Frame COMPLETO
        //frame_hex := lsDisp.Items.Strings[lsDisp.ItemIndex];
        //OU
        //+Bytes RELEVANTES (demais iguais a 0x00)
        frame_disp := lsDisp.Items.Strings[lsDisp.ItemIndex];

        //-Tipo disp.
        if (frame_disp[1] = '5') then
        begin
         //BIOMETRIA: <idBio_high> e <idBio_low> relevantes
         frame_hex := '53000000';
         frame_hex := frame_hex + Copy(frame_disp, 9, 4);
        end
        else
         if (frame_disp[1] = '7') then
         begin
          //SENHA: "senha", unid_h e unid_l relevantes
          frame_hex := '73';
          frame_hex := frame_hex + Copy(frame_disp, 3, 6);
          frame_hex := frame_hex + '0000';
          frame_hex := frame_hex + Copy(frame_disp, 13, 4);
         end
         else
         begin
          //DEMAIS DISP.: apenas "serial" relevante
          frame_hex := Copy(frame_disp, 1, 8);
         end;

        while (Length(frame_hex) < (39*2)) do
         frame_hex := frame_hex + '00';

        // Apagar dispositivo (Comando 67: 0x00 + 0x43 + 0x04 + <frame de disp. (39 bytes)> + <cs>)
        // Resposta de 5 bytes: 0x00 + 0x43 + 0x04 + <resposta> + <cs>
        toutComando(True, 5);
        enviaComando('004304'+frame_hex);
end;

end.
