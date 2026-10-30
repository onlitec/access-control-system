# Módulo do morador (HikCentral)

Módulo único, pensado para rodar no mesmo Windows Server do HikCentral. Fala só com a OpenAPI do
HikCentral 3.1.1; não depende do restante do OnliAcesso. A proposta completa está em
`proposta/modulo-morador-hikcentral.md` (pasta de arquivos do projeto).

## Fase 1 (esta)
- Moradores lidos do HikCentral (`person/personList`), indexados por CPF (campo personalizado `CPF`).
- Login sem senha: CPF, código de 6 dígitos por WhatsApp (Twilio) ou e-mail (SMTP), sessão JWT.
- Banco local SQLite só para os códigos de login (o morador não é copiado).

## Rodar em desenvolvimento
```
cp .env.example .env      # preencher HIK_* e JWT_SECRET; NOTIFY_MODE=console imprime o código no log
npm install
npm run prisma:push       # cria o SQLite
npm run smoke:hik         # leitura no HikCentral (só contagens, sem dados pessoais)
npm run dev               # http://localhost:4100
npm test
```

## Segurança
- A API responde igual para CPF existente e inexistente (não serve de consulta de moradores).
- O código vale 10 min, com 5 tentativas, 1 por minuto e 5 por hora por CPF; é guardado só como HMAC.
- `NOTIFY_MODE=console` é recusado com `NODE_ENV=production`.
- Credenciais da OpenAPI só em variáveis de ambiente.

## Próximas fases
Convite por link e aprovação do morador (reaproveitando `hikcentralVisitorAppointment`), veículo,
visitantes salvos, família, PWA e instalador Windows.
