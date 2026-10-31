# Módulo do morador (HikCentral)

Módulo único, pensado para rodar no mesmo Windows Server do HikCentral. Fala só com a OpenAPI do
HikCentral 3.1.1; não depende do restante do OnliAcesso. A proposta completa está em
`proposta/modulo-morador-hikcentral.md` (pasta de arquivos do projeto).

## Fase 1 (esta)
- Moradores lidos do HikCentral (`person/personList`), indexados por CPF (campo personalizado `CPF`).
- Login sem senha: CPF, código de 6 dígitos por WhatsApp (Twilio) ou e-mail (SMTP), sessão JWT.
- Banco local SQLite só para os códigos de login (o morador não é copiado).

## Fase 2
- Morador (`/app.html`): cria convite (visitante ou prestador, validade, veículo opcional), compartilha o link
  (WhatsApp/e-mail do próprio aparelho ou envio pelo servidor), vê os cadastros e aprova, recusa ou cancela.
- Visitante (`/v/<token>`): preenche nome, telefone, data, foto do rosto e do documento (e placa, se permitido)
  e acompanha o status. O navegador reduz a foto do rosto para caber no limite do HikCentral (JPG de 10 a 100 KB).
- Aprovar cria o agendamento no HikCentral (`v2/appointment`) com o morador como visitado e o nível de visitante da
  torre dele (ou o padrão). Cancelar apaga o agendamento. Se o HikCentral recusar, o cadastro volta a ficar
  pendente com o motivo, e o morador pode tentar de novo.
- As fotos ficam no SQLite só até a decisão do morador; depois de aprovar, recusar ou cancelar, são apagadas.
- O acesso vale o dia inteiro da data escolhida (no dia de hoje, a partir de agora).

## Fase 3
- **Visitantes salvos:** se o visitante marcar a opção de guardar os dados, o morador que aprovar passa a ter
  essa pessoa em "Visitantes salvos" (dados e fotos) e pode convidá-la de novo escolhendo só a data, sem novo
  cadastro (já vai direto para o HikCentral). O morador pode esquecer o visitante a qualquer momento, e quem fica
  `SAVED_RETENTION_DAYS` (180) dias sem visita é apagado automaticamente.
- **Família:** um morador (responsável) pede o vínculo pelo CPF do familiar, que recebe o aviso e precisa aceitar.
  Depois do aceite, o responsável vê e pode aprovar, recusar e cancelar os convites do familiar; no HikCentral o
  visitado continua sendo o familiar. Qualquer um dos dois pode desfazer o vínculo. A resposta ao pedido é a mesma
  exista ou não o CPF.
- Não depende de como as organizações/apartamentos estão no HikCentral; uma sugestão automática de familiares
  (mesmo apartamento) pode vir depois que a estrutura de produção for conhecida.

## Rodar em desenvolvimento
```
cp .env.example .env      # preencher HIK_* e JWT_SECRET; NOTIFY_MODE=console imprime o código no log
npm install
npm run prisma:push       # cria o SQLite
npm run smoke:hik         # leitura no HikCentral (só contagens, sem dados pessoais)
npm run dev               # http://localhost:4100
npm test
npm run e2e:hik           # ponta a ponta contra um HikCentral de TESTE (ver o cabeçalho do script)
npm run e2e:hik:family    # idem, para família e visitantes salvos
```

## Segurança
- A API responde igual para CPF existente e inexistente (não serve de consulta de moradores).
- O código vale 10 min, com 5 tentativas, 1 por minuto e 5 por hora por CPF; é guardado só como HMAC.
- `NOTIFY_MODE=console` é recusado com `NODE_ENV=production`.
- Credenciais da OpenAPI só em variáveis de ambiente.

## Próximas fases
PWA com push e instalador Windows.

## App instalável, notificações e instalador (fase 4)

- **Banco automático:** `migrations/NNN_*.sql` são aplicadas ao iniciar (tabela `_migrations`); não precisa da CLI do Prisma no servidor. Ao mudar o `schema.prisma`, gere a próxima migração com `prisma migrate diff --from-schema-datamodel <schema anterior> --to-schema-datamodel prisma/schema.prisma --script`.
- **PWA:** `public/manifest.webmanifest`, `sw.js` (cache do casco, `/api` nunca em cache) e botão "Ativar notificações" no `app.html`.
- **Push:** defina `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (`npm run vapid` gera o par). Quando um visitante conclui o cadastro, o morador e seus responsáveis de família recebem push; se nenhum aparelho estiver inscrito, o aviso segue por WhatsApp/e-mail.
- **Instalador Windows:** veja `installer/INSTALACAO.md`.
