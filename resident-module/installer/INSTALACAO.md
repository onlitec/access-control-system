# Instalação do Módulo do Morador no Windows Server do HikCentral

## 1. Gerar o instalador (uma vez, numa máquina Linux/WSL com Docker)
```
cd resident-module/installer
bash build-package.sh          # baixa Node + WinSW, monta o pacote e compila o .exe
bash build-package.sh --stage-only   # só monta a pasta stage/ (sem Docker)
```
Resultado: `installer/dist/ModuloMoradorSetup-<versão>.exe` (+ `.sha256`).

## 2. Instalar no servidor
Execute o `.exe` como administrador. O assistente pergunta:
- endereço do HikCentral (ex.: `https://127.0.0.1`), AppKey, AppSecret e utilizador associado do OpenAPI;
- endereço público HTTPS do módulo (usado nos links enviados aos visitantes);
- porta local (padrão 4100).

O instalador cria o serviço **ModuloMorador** (início automático, reinicia se cair), grava a
configuração em `C:\ProgramData\ModuloMorador\config\.env` (só SYSTEM e Administradores leem),
gera sozinho o `JWT_SECRET` e as chaves das notificações push, e cria o banco SQLite em
`C:\ProgramData\ModuloMorador\data`. Logs em `C:\ProgramData\ModuloMorador\logs`.

**Atualizar:** rode o novo instalador por cima. Configuração e banco são mantidos; o banco é
atualizado sozinho na inicialização (migrações em `migrations/`).
**Desinstalar:** remove programa e serviço; `C:\ProgramData\ModuloMorador` fica (apague à mão para zerar).

## 3. Depois de instalar
1. Edite `C:\ProgramData\ModuloMorador\config\.env` e preencha o envio do código de login:
   - WhatsApp: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (remetente aprovado);
   - e-mail: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
   Reinicie: `Restart-Service ModuloMorador`.
2. Publique em **HTTPS** (obrigatório para instalar o app no celular e para notificações push).
   O módulo escuta só em `127.0.0.1:<porta>`; coloque um proxy/túnel na frente:
   - **Cloudflare Tunnel** (recomendado, não abre porta no firewall): `cloudflared` apontando
     `https://morador.seudominio.com.br` → `http://127.0.0.1:4100`; ou
   - IIS/Nginx com certificado válido fazendo proxy para `http://127.0.0.1:4100`.
   O `PUBLIC_URL` do `.env` deve ser esse endereço.
3. Teste: abra `<PUBLIC_URL>/api/health` (deve responder `{"status":"ok"}`), depois entre em
   `<PUBLIC_URL>/` com o CPF de um morador. No celular, "Adicionar à tela inicial" instala o app e o botão
   "Ativar notificações" aparece dentro dele.

## Limites conhecidos
- O compilador do instalador (Inno Setup) e o script `setup.ps1` ainda não foram executados num Windows real;
  o pacote `stage/` foi validado subindo o servidor a partir dele (sem CLI do Prisma) em Linux.
- iPhone só recebe push com o app instalado na tela inicial (iOS 16.4+).
- A sessão do app dura 8 h; ao reabrir o app instalado pode ser preciso entrar de novo.
