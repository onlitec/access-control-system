object fprincipal: Tfprincipal
  Left = 223
  Top = 108
  BorderIcons = [biSystemMenu, biMinimize]
  BorderStyle = bsSingle
  Caption = 'Demo Nice MG3000 - v1'
  ClientHeight = 577
  ClientWidth = 667
  Color = clBtnFace
  DefaultMonitor = dmPrimary
  Font.Charset = DEFAULT_CHARSET
  Font.Color = clWindowText
  Font.Height = -11
  Font.Name = 'MS Sans Serif'
  Font.Style = []
  OldCreateOrder = False
  Position = poScreenCenter
  OnClose = FormClose
  OnCreate = FormCreate
  PixelsPerInch = 96
  TextHeight = 13
  object pcGuias: TPageControl
    Left = 15
    Top = 149
    Width = 636
    Height = 416
    ActivePage = TabSheet1
    TabOrder = 2
    Visible = False
    object TabSheet1: TTabSheet
      Caption = 'Eventos'
      object Label1: TLabel
        Left = 160
        Top = 35
        Width = 111
        Height = 13
        Caption = 'Frame de acionamento:'
      end
      object edFrame: TEdit
        Left = 161
        Top = 50
        Width = 306
        Height = 20
        Font.Charset = ANSI_CHARSET
        Font.Color = clWindowText
        Font.Height = -12
        Font.Name = 'Lucida Console'
        Font.Style = []
        ParentFont = False
        ReadOnly = True
        TabOrder = 0
      end
      object GroupBox2: TGroupBox
        Left = 174
        Top = 75
        Width = 281
        Height = 231
        Caption = 'Evento (Envio autom'#225'tico - Comando 4)'
        TabOrder = 1
        object Label2: TLabel
          Left = 15
          Top = 25
          Width = 24
          Height = 13
          Caption = 'Tipo:'
        end
        object Label3: TLabel
          Left = 15
          Top = 50
          Width = 81
          Height = 13
          Caption = 'Serial/Senha/ID:'
        end
        object Label4: TLabel
          Left = 15
          Top = 75
          Width = 61
          Height = 13
          Caption = 'Data e Hora:'
        end
        object Label5: TLabel
          Left = 15
          Top = 100
          Width = 88
          Height = 13
          Caption = 'Dispositivo e CAN:'
        end
        object Label6: TLabel
          Left = 15
          Top = 125
          Width = 43
          Height = 13
          Caption = 'Unidade:'
        end
        object Label7: TLabel
          Left = 15
          Top = 150
          Width = 30
          Height = 13
          Caption = 'Bloco:'
        end
        object Label8: TLabel
          Left = 15
          Top = 175
          Width = 32
          Height = 13
          Caption = 'Sa'#237'da:'
        end
        object Label9: TLabel
          Left = 15
          Top = 200
          Width = 36
          Height = 13
          Caption = 'Bateria:'
        end
        object lbTipo: TLabel
          Left = 45
          Top = 25
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbSerial: TLabel
          Left = 98
          Top = 50
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbDataHora: TLabel
          Left = 85
          Top = 75
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbDisp: TLabel
          Left = 110
          Top = 100
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbUnid: TLabel
          Left = 65
          Top = 125
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbBloco: TLabel
          Left = 55
          Top = 150
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbSaida: TLabel
          Left = 55
          Top = 175
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbBat: TLabel
          Left = 60
          Top = 200
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
      end
      object btLerRelogio: TButton
        Left = 328
        Top = 342
        Width = 126
        Height = 25
        Caption = 'Ler Data e Hora'
        TabOrder = 3
        OnClick = btLerRelogioClick
      end
      object btEnviarRelogio: TButton
        Left = 174
        Top = 342
        Width = 126
        Height = 25
        Caption = 'Enviar Data e Hora'
        TabOrder = 2
        OnClick = btEnviarRelogioClick
      end
    end
    object TabSheet2: TTabSheet
      Caption = 'Dispositivos'
      ImageIndex = 1
      object Label10: TLabel
        Left = 110
        Top = 30
        Width = 58
        Height = 13
        Caption = 'Quantidade:'
      end
      object lbQuantDisp: TLabel
        Left = 175
        Top = 30
        Width = 29
        Height = 13
        Caption = '- - - -'
        Font.Charset = DEFAULT_CHARSET
        Font.Color = clWindowText
        Font.Height = -11
        Font.Name = 'MS Sans Serif'
        Font.Style = [fsBold]
        ParentFont = False
      end
      object GroupBox3: TGroupBox
        Left = 73
        Top = 172
        Width = 481
        Height = 204
        Caption = 'Dispositivos'
        TabOrder = 2
        object Label11: TLabel
          Left = 127
          Top = 25
          Width = 227
          Height = 13
          Caption = 'Selecione um dispositivo na lista acima!'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clBlue
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold, fsUnderline]
          ParentFont = False
        end
        object Label12: TLabel
          Left = 15
          Top = 50
          Width = 24
          Height = 13
          Caption = 'Tipo:'
        end
        object Label13: TLabel
          Left = 15
          Top = 75
          Width = 65
          Height = 13
          Caption = 'Serial/Senha:'
        end
        object Label14: TLabel
          Left = 15
          Top = 100
          Width = 62
          Height = 13
          Caption = 'Contador/ID:'
        end
        object Label15: TLabel
          Left = 15
          Top = 125
          Width = 43
          Height = 13
          Caption = 'Unidade:'
        end
        object Label16: TLabel
          Left = 15
          Top = 150
          Width = 30
          Height = 13
          Caption = 'Bloco:'
        end
        object Label17: TLabel
          Left = 200
          Top = 50
          Width = 69
          Height = 13
          Caption = 'RECs Destino:'
        end
        object Label18: TLabel
          Left = 200
          Top = 75
          Width = 64
          Height = 13
          Caption = 'Identifica'#231#227'o:'
        end
        object Label19: TLabel
          Left = 200
          Top = 100
          Width = 97
          Height = 13
          Caption = #218'ltimo Acionamento:'
        end
        object Label20: TLabel
          Left = 200
          Top = 125
          Width = 36
          Height = 13
          Caption = 'Bateria:'
        end
        object Label21: TLabel
          Left = 200
          Top = 150
          Width = 40
          Height = 13
          Caption = 'Ve'#237'culo:'
        end
        object lbTipoD: TLabel
          Left = 45
          Top = 50
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbSerialD: TLabel
          Left = 83
          Top = 75
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbContaD: TLabel
          Left = 82
          Top = 100
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbUnidD: TLabel
          Left = 65
          Top = 125
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbBlocoD: TLabel
          Left = 50
          Top = 150
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbHabD: TLabel
          Left = 271
          Top = 50
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbLabelD: TLabel
          Left = 270
          Top = 75
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbAcionD: TLabel
          Left = 302
          Top = 100
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbBatD: TLabel
          Left = 245
          Top = 125
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object lbVeiculoD: TLabel
          Left = 247
          Top = 150
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
        object Label36: TLabel
          Left = 15
          Top = 176
          Width = 32
          Height = 13
          Caption = 'Grupo:'
        end
        object lbGrupoD: TLabel
          Left = 52
          Top = 176
          Width = 29
          Height = 13
          Caption = '- - - -'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
        end
      end
      object lsDisp: TListBox
        Left = 15
        Top = 50
        Width = 596
        Height = 111
        Font.Charset = ANSI_CHARSET
        Font.Color = clWindowText
        Font.Height = -12
        Font.Name = 'Lucida Console'
        Font.Style = []
        ItemHeight = 12
        ParentFont = False
        TabOrder = 1
        OnClick = lsDispClick
      end
      object btLerDisp: TButton
        Left = 15
        Top = 20
        Width = 91
        Height = 25
        Caption = 'Ler Dispositivos'
        TabOrder = 0
        OnClick = btLerDispClick
      end
      object btApagarDisp: TButton
        Left = 500
        Top = 20
        Width = 109
        Height = 25
        Caption = 'Apagar Dispositivo'
        TabOrder = 3
        OnClick = btApagarDispClick
      end
    end
    object TabSheet4: TTabSheet
      Caption = 'Cadastrar Dispositivo'
      ImageIndex = 3
      object Label35: TLabel
        Left = 40
        Top = 324
        Width = 191
        Height = 13
        Caption = 'C'#243'digo Wiegand (W:) para Serial:'
        Font.Charset = DEFAULT_CHARSET
        Font.Color = clWindowText
        Font.Height = -11
        Font.Name = 'MS Sans Serif'
        Font.Style = [fsBold]
        ParentFont = False
      end
      object lblMsgDigital: TLabel
        Left = 420
        Top = 294
        Width = 163
        Height = 37
        Alignment = taCenter
        AutoSize = False
        Caption = '- - - -'
        Font.Charset = DEFAULT_CHARSET
        Font.Color = clWindowText
        Font.Height = -11
        Font.Name = 'MS Sans Serif'
        Font.Style = [fsBold]
        ParentFont = False
        WordWrap = True
      end
      object GroupBox5: TGroupBox
        Left = 40
        Top = 18
        Width = 361
        Height = 85
        Caption = 'Dados do dispositivo'
        TabOrder = 0
        object Label26: TLabel
          Left = 18
          Top = 24
          Width = 24
          Height = 13
          Caption = 'Tipo:'
        end
        object lblSerial: TLabel
          Left = 144
          Top = 24
          Width = 61
          Height = 13
          Caption = 'Serial (hexa):'
        end
        object lblContador: TLabel
          Left = 222
          Top = 24
          Width = 78
          Height = 13
          Caption = 'Contador (hexa):'
        end
        object cbDisp2: TComboBox
          Left = 18
          Top = 42
          Width = 115
          Height = 22
          Style = csOwnerDrawVariable
          ItemIndex = 0
          TabOrder = 0
          Text = 'Controle (TX)'
          OnChange = cbDisp2Change
          Items.Strings = (
            'Controle (TX)'
            'TAG Ativo'
            'Cart'#227'o/Chaveiro'
            'Biometria (CTWB)'
            'TAG Passivo'
            'Senha (CTW)')
        end
        object edSerial: TEdit
          Left = 144
          Top = 42
          Width = 67
          Height = 21
          CharCase = ecUpperCase
          MaxLength = 7
          TabOrder = 1
          OnKeyPress = edSerialKeyPress
        end
        object edContador: TEdit
          Left = 222
          Top = 42
          Width = 49
          Height = 21
          CharCase = ecUpperCase
          MaxLength = 4
          TabOrder = 2
          OnKeyPress = edContadorKeyPress
        end
        object btIdVago: TButton
          Left = 282
          Top = 42
          Width = 61
          Height = 21
          Caption = 'ID Vago'
          Enabled = False
          TabOrder = 3
          OnClick = btIdVagoClick
        end
      end
      object GroupBox6: TGroupBox
        Left = 40
        Top = 114
        Width = 361
        Height = 85
        Caption = 'Dados da moradia'
        TabOrder = 1
        object Label29: TLabel
          Left = 12
          Top = 24
          Width = 43
          Height = 13
          Caption = 'Unidade:'
        end
        object Label30: TLabel
          Left = 84
          Top = 24
          Width = 30
          Height = 13
          Caption = 'Bloco:'
        end
        object Label31: TLabel
          Left = 150
          Top = 24
          Width = 64
          Height = 13
          Caption = 'Identifica'#231#227'o:'
        end
        object Label22: TLabel
          Left = 294
          Top = 24
          Width = 32
          Height = 13
          Caption = 'Grupo:'
        end
        object cbUnidade: TComboBox
          Left = 12
          Top = 42
          Width = 61
          Height = 22
          Style = csOwnerDrawVariable
          TabOrder = 0
        end
        object cbBloco: TComboBox
          Left = 84
          Top = 42
          Width = 55
          Height = 22
          Style = csOwnerDrawVariable
          TabOrder = 1
        end
        object edIdentificacao: TEdit
          Left = 150
          Top = 42
          Width = 133
          Height = 21
          CharCase = ecUpperCase
          MaxLength = 18
          TabOrder = 2
        end
        object cbGrupo: TComboBox
          Left = 294
          Top = 42
          Width = 55
          Height = 22
          Style = csOwnerDrawVariable
          TabOrder = 3
        end
      end
      object GroupBox7: TGroupBox
        Left = 40
        Top = 210
        Width = 361
        Height = 85
        Caption = 'Dados do ve'#237'culo'
        TabOrder = 2
        object Label32: TLabel
          Left = 18
          Top = 24
          Width = 33
          Height = 13
          Caption = 'Marca:'
        end
        object Label33: TLabel
          Left = 138
          Top = 24
          Width = 19
          Height = 13
          Caption = 'Cor:'
        end
        object Label34: TLabel
          Left = 246
          Top = 24
          Width = 30
          Height = 13
          Caption = 'Placa:'
        end
        object cbMarcaV: TComboBox
          Left = 18
          Top = 42
          Width = 109
          Height = 22
          Style = csOwnerDrawVariable
          TabOrder = 0
        end
        object cbCorV: TComboBox
          Left = 138
          Top = 42
          Width = 97
          Height = 22
          Style = csOwnerDrawVariable
          TabOrder = 1
        end
        object edPlacaV: TEdit
          Left = 246
          Top = 42
          Width = 97
          Height = 21
          CharCase = ecUpperCase
          MaxLength = 7
          TabOrder = 2
        end
      end
      object GroupBox8: TGroupBox
        Left = 418
        Top = 18
        Width = 169
        Height = 181
        Caption = 'Receptores de destino'
        TabOrder = 3
        object clRecs: TCheckListBox
          Left = 24
          Top = 24
          Width = 109
          Height = 151
          BorderStyle = bsNone
          Flat = False
          ItemHeight = 18
          Items.Strings = (
            'Receptor 1'
            'Receptor 2'
            'Receptor 3'
            'Receptor 4'
            'Receptor 5'
            'Receptor 6'
            'Receptor 7'
            'Receptor 8')
          Style = lbOwnerDrawVariable
          TabOrder = 0
        end
      end
      object btCadastrar: TButton
        Left = 436
        Top = 216
        Width = 121
        Height = 25
        Caption = 'Cadastrar'
        TabOrder = 4
        OnClick = btCadastrarClick
      end
      object btAtualizar: TButton
        Left = 436
        Top = 342
        Width = 121
        Height = 25
        Caption = 'Atualizar Receptores'
        TabOrder = 6
        OnClick = btAtualizarClick
      end
      object edWie1: TEdit
        Left = 238
        Top = 318
        Width = 37
        Height = 21
        MaxLength = 3
        TabOrder = 7
        Text = '000'
        OnKeyPress = edWie1KeyPress
      end
      object edWie2: TEdit
        Left = 280
        Top = 318
        Width = 49
        Height = 21
        MaxLength = 5
        TabOrder = 8
        Text = '00000'
        OnKeyPress = edWie2KeyPress
      end
      object btConvWie: TButton
        Left = 238
        Top = 342
        Width = 90
        Height = 25
        Caption = 'Converter'
        Enabled = False
        TabOrder = 9
        OnClick = btConvWieClick
      end
      object btVincularDigital: TButton
        Left = 438
        Top = 258
        Width = 121
        Height = 25
        Caption = 'Vincular Digitais'
        Enabled = False
        TabOrder = 5
        OnClick = btVincularDigitalClick
      end
    end
    object TabSheet3: TTabSheet
      Caption = 'Acionar Sa'#237'das'
      ImageIndex = 2
      object GroupBox4: TGroupBox
        Left = 141
        Top = 30
        Width = 346
        Height = 124
        Caption = 'Acionar rel'#233's (Receptores - Comando 13)'
        TabOrder = 0
        object Label24: TLabel
          Left = 15
          Top = 25
          Width = 47
          Height = 13
          Caption = 'Receptor:'
        end
        object Label25: TLabel
          Left = 169
          Top = 25
          Width = 50
          Height = 13
          Caption = 'End. CAN:'
        end
        object cbDisp: TComboBox
          Left = 15
          Top = 40
          Width = 142
          Height = 22
          Style = csOwnerDrawVariable
          ItemIndex = 0
          TabOrder = 0
          Text = 'TX (RF)'
          Items.Strings = (
            'TX (RF)'
            'TAG Ativo (TA)'
            'Cart'#227'o (CT/CTW)'
            'TAG Passivo (TP/UHF)')
        end
        object cbCAN: TComboBox
          Left = 169
          Top = 40
          Width = 54
          Height = 22
          Style = csOwnerDrawFixed
          ItemIndex = 0
          TabOrder = 1
          Text = '1'
          Items.Strings = (
            '1'
            '2'
            '3'
            '4'
            '5'
            '6'
            '7'
            '8')
        end
        object cxEVT: TCheckBox
          Left = 235
          Top = 40
          Width = 91
          Height = 17
          Caption = 'Gerar evento?'
          Checked = True
          State = cbChecked
          TabOrder = 2
        end
        object btR1: TButton
          Left = 15
          Top = 82
          Width = 75
          Height = 25
          Caption = 'Rel'#233' 1'
          TabOrder = 3
          OnClick = btR1Click
        end
        object btR2: TButton
          Left = 95
          Top = 82
          Width = 75
          Height = 25
          Caption = 'Rel'#233' 2'
          TabOrder = 4
          OnClick = btR2Click
        end
        object btR3: TButton
          Left = 175
          Top = 82
          Width = 75
          Height = 25
          Caption = 'Rel'#233' 3'
          TabOrder = 5
          OnClick = btR3Click
        end
        object btR4: TButton
          Left = 255
          Top = 82
          Width = 75
          Height = 25
          Caption = 'Rel'#233' 4'
          TabOrder = 6
          OnClick = btR4Click
        end
      end
      object GroupBox9: TGroupBox
        Left = 141
        Top = 186
        Width = 346
        Height = 109
        Caption = 'Modo Remoto (Receptores - Comando 35)'
        TabOrder = 1
        object Label23: TLabel
          Left = 22
          Top = 24
          Width = 301
          Height = 31
          Alignment = taCenter
          AutoSize = False
          Caption = 
            'Rel'#233's de TODOS os Receptores ser'#227'o acionados somente pelo PC (po' +
            'r 90 segundos)'
          Font.Charset = DEFAULT_CHARSET
          Font.Color = clWindowText
          Font.Height = -11
          Font.Name = 'MS Sans Serif'
          Font.Style = [fsBold]
          ParentFont = False
          WordWrap = True
        end
        object btModoRemoto: TButton
          Left = 135
          Top = 66
          Width = 75
          Height = 25
          Caption = 'Ativar'
          TabOrder = 0
          OnClick = btModoRemotoClick
        end
      end
    end
  end
  object GroupBox1: TGroupBox
    Left = 219
    Top = 13
    Width = 229
    Height = 84
    Caption = 'Conex'#227'o TCP (Guarita em modo SERVER)'
    TabOrder = 0
    object lbIP: TLabel
      Left = 30
      Top = 30
      Width = 62
      Height = 13
      Caption = 'Endere'#231'o IP:'
    end
    object lbPort: TLabel
      Left = 144
      Top = 30
      Width = 52
      Height = 13
      Caption = 'Porta TCP:'
    end
    object edIP: TEdit
      Left = 30
      Top = 48
      Width = 103
      Height = 21
      MaxLength = 15
      TabOrder = 0
      Text = '192.168.0.10'
    end
    object edPorta: TEdit
      Left = 144
      Top = 48
      Width = 49
      Height = 21
      MaxLength = 5
      TabOrder = 1
      Text = '9000'
    end
  end
  object btConectar: TButton
    Left = 274
    Top = 110
    Width = 119
    Height = 25
    Caption = 'Conectar'
    TabOrder = 1
    OnClick = btConectarClick
  end
  object toutCom: TTimer
    Enabled = False
    OnTimer = toutComTimer
    Left = 508
    Top = 84
  end
  object csTCP: TClientSocket
    Active = False
    ClientType = ctNonBlocking
    Port = 0
    OnConnect = csTCPConnect
    OnRead = csTCPRead
    OnError = csTCPError
    Left = 164
    Top = 48
  end
  object toutComando57: TTimer
    Enabled = False
    OnTimer = toutComando57Timer
    Left = 508
    Top = 20
  end
end
