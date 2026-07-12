# Manual de Instalação — OnliAcesso no Windows

Instalador único (`OnliAcessoSetup-<versão>.exe`, Inno Setup) com **tudo
embutido** — não é preciso instalar Node, banco ou qualquer dependência antes.

## 1. Requisitos

- **Windows 10/11 ou Windows Server 2019+**, 64 bits
- **4 GB de RAM** (8 GB se for usar o VMS/câmeras), 2 núcleos
- **20 GB livres** em disco + espaço para gravações de câmeras (se VMS)
- Conta com privilégios de **Administrador**
- Porta **80** livre (o nginx embutido é a entrada única dos painéis)
- Rede local com os equipamentos (leitores faciais, guarita, câmeras/DVRs)

O instalador embute: Node.js 20, PostgreSQL 16, nginx, ffmpeg, WinSW e
(componente VMS) MediaMTX + rclone. Internet **não** é obrigatória durante a
instalação.

## 2. Instalação

1. **Baixar** `https://cloud.onlitec.com.br/downloads/OnliAcessoSetup-<versão>.exe`
   (versão atual em `https://cloud.onlitec.com.br/downloads/latest.json`).
2. **Conferir a integridade** (PowerShell) contra o `.sha256` publicado ao lado:
   ```powershell
   Get-FileHash .\OnliAcessoSetup-<versão>.exe -Algorithm SHA256
   ```
3. **Executar como Administrador** e seguir o assistente:
   - **Pasta de destino**: `C:\OnliAcesso` (padrão recomendado).
   - **Nome do condomínio**: aparece nos painéis e relatórios.
   - **Componente "VMS (Gerenciador de Imagens)"**: marque para habilitar
     câmeras/DVRs, gravação e acesso remoto às imagens.
   - Campos de HikCentral são **opcionais** (o sistema é standalone; só
     preencha em integrações legadas).
4. A instalação roda com barra de progresso nativa (5–10 min). Ela:
   - copia os aplicativos e binários para `C:\OnliAcesso`;
   - cria o banco `onliacesso` no PostgreSQL embutido (porta 5432, ou **5433**
     se já existir outro PostgreSQL na máquina) e roda as migrações;
   - gera o `.env` com segredos aleatórios por instalação (`JWT_SECRET` etc.);
   - cria o **admin inicial** e grava as credenciais em
     **`C:\OnliAcesso\config\credenciais.txt`**;
   - registra e inicia os serviços do Windows (WinSW).

Reinstalar/atualizar por cima é seguro: banco, `.env` e gravações são
preservados (o assistente executa a limpeza da versão anterior sozinho).

## 3. Primeiro acesso

No navegador, na própria máquina ou na rede local:

| Aplicação | URL |
|---|---|
| Painel do operador (portaria) | `http://localhost/painel/` |
| Painel administrativo | `http://localhost/admin/` |
| Portal do morador/visitante | `http://localhost/login` |

Credenciais iniciais em `C:\OnliAcesso\config\credenciais.txt`:

```
Admin inicial: admin@onliacesso.local
Senha inicial: <gerada aleatoriamente>
```

**Anote e apague o arquivo depois.** Primeiros passos recomendados no Admin:

1. **Configurações → E-mail (SMTP)** — necessário para códigos de verificação
   e primeiro acesso de moradores.
2. Criar os usuários reais (operadores/administradores) e trocar/desativar o
   admin inicial.
3. Cadastrar torres/unidades, moradores e equipamentos.
4. (Opcional) **Configurações → Acesso via nuvem** — publica as câmeras em
   `cloud.onlitec.com.br` (ver `docs/CLOUD-E-RELEASES.md`). Informe o código
   do cliente e a chave de ativação fornecida pela Onlitec.

## 4. Serviços e operação

Serviços do Windows criados (visíveis em `services.msc`, gerenciados pelo
WinSW; logs em `C:\OnliAcesso\services\*.log`):

| Serviço | Função | Porta |
|---|---|---|
| `onliacesso-api` | Backend (Express + Prisma) | 3001 |
| `onliacesso-access` | Painel do operador (SPA) | interno |
| `onliacesso-admin` | Painel administrativo (SPA) | interno |
| `onliacesso-visitor` | Portal do morador (Next.js) | 3002 |
| `onliacesso-proxy` | nginx — entrada única dos painéis | 80 |
| `onliacesso-postgres` | PostgreSQL embutido | 5432/5433 |
| `onliacesso-vms` | Gerenciador de câmeras/gravações (se VMS) | 3011 |
| `onliacesso-mediamtx` | Streaming HLS/WebRTC/RTSP (se VMS) | 8888/8889/8554 |

Comandos úteis (PowerShell como Administrador):

```powershell
Get-Service onliacesso-*                    # estado de todos
Restart-Service onliacesso-api              # reiniciar um serviço
Get-Content C:\OnliAcesso\services\onliacesso-api.out.log -Tail 50
```

A tela **Admin → Serviços** também lista e reinicia os serviços pelo navegador.

> O firewall do Windows é configurado pelo instalador para os painéis na rede
> local. Para o acesso via nuvem, o botão "Habilitar acesso via nuvem" cria as
> regras restritas ao VPS automaticamente (3001/8888/8889 apenas para o IP
> Tailscale do VPS).

## 5. Atualização

1. **Admin → Configurações → Atualizações → Verificar agora** compara a versão
   instalada com `https://cloud.onlitec.com.br/downloads/latest.json` e mostra
   o link do instalador novo quando houver.
2. Para aplicar: baixe o `OnliAcessoSetup-<nova-versão>.exe`, confira o SHA256
   e **execute por cima da instalação existente** — banco, `.env`, fotos e
   gravações são preservados; as migrações de banco rodam sozinhas.

## 6. Desinstalação

**Configurações do Windows → Aplicativos → OnliAcesso → Desinstalar** (ou
`C:\OnliAcesso\unins000.exe`). Os serviços são removidos; a pasta de dados
(banco/gravações) só é apagada mediante confirmação.

## 7. Solução de problemas

| Sintoma | Verificação |
|---|---|
| Página não abre | `Get-Service onliacesso-proxy, onliacesso-api` — inicie o que estiver parado |
| Serviço não sobe | Log em `C:\OnliAcesso\services\<serviço>.err.log`; conflito de porta é a causa mais comum |
| Porta 80 ocupada | Outro IIS/Apache/Skype na máquina — libere a 80 e reinicie `onliacesso-proxy` |
| Login falha com o admin inicial | Confira `C:\OnliAcesso\config\credenciais.txt` (e-mail `admin@onliacesso.local`) |
| PostgreSQL não inicia | Já existe outro PostgreSQL usando a porta? O embutido usa 5433 nesses casos — veja `PG_PORT` no `.env` |
| Câmera sem imagem | `onliacesso-vms` e `onliacesso-mediamtx` ativos? Status do canal em Admin → Câmeras |
| E-mails não saem | SMTP não configurado — Admin → Configurações → E-mail |
| Cloud não habilita | O card mostra o passo que falhou (tailscale/firewall/registro/TURN); instale o Tailscale se solicitado e use a chave de ativação da Onlitec |

Suporte: Onlitec — galvatec@gmail.com
