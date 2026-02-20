# Plano de Migração: Calabasas Access Control System (Monorepo)

Este documento descreve o processo de migração da estrutura legada para o novo Monorepo centralizado.

## 1. Estrutura Atualizada
- `/backend-api`: Ponto central de verdade. Único detentor das chaves HikCentral. Implementa HMAC-SHA256.
- `/frontend-visitor`: Aplicativo para visitantes (migrado do `visitorapp`).
- `/frontend-access`: Painel de controle de acesso (migrado do `access_control_panel`).
- `/frontend-admin`: Novo painel administrativo consolidado.
- `/shared`: Interfaces TypeScript e DTOs compartilhados entre todos os pacotes.

## 2. Passos de Migração dos Componentes React

### Fase 1: Limpeza de Dependências
- Removido `supabase-js` dos frontends.
- Removidas chaves do HikCentral dos arquivos `.env` dos frontends (Soberania do Backend).

### Fase 2: Refatoração da Camada de Dados
- Todos os arquivos `db/api.ts` ou `lib/api.ts` nos frontends devem agora apontar para `http://localhost:3001/api`.
- Substituição de chamadas diretas ao banco (Supabase) por chamadas REST ao `backend-api`.
- Uso do `shared` package para tipagem consistente.

### Fase 3: Autenticação
- Migração de Supabase Auth para JWT local.
- O Frontend deve armazenar o token JWT no `localStorage` e enviá-lo no header `Authorization: Bearer <token>`.

### Fase 4: Integração HikCentral
- Qualquer componente que precise interagir com HikCentral deve agora chamar os endpoints no `backend-api`:
  - `POST /api/persons/sync` -> Para moradores.
  - `POST /api/visitors/reserve` -> Para reserva de visitantes.
  - `GET /api/access-logs` -> Para logs em tempo real.

## 3. Como Rodar o Novo Sistema
1. **Instalação**: No root, execute `npm install`.
2. **Banco de Dados**: Certifique-se de que o Docker está rodando e execute `docker-compose up -d`.
3. **Prisma**: Execute `npx prisma migrate dev` dentro de `/backend-api`.
4. **Dev Mode**: No root, execute `npm run dev` para subir todas as aplicações simultaneamente utilizando workspaces.

## 4. Deploy (Servidor Local 172.20.120.41)
O arquivo `docker-compose.yml` já está configurado para subir o PostgreSQL e o Backend no servidor local. Os frontends podem ser servidos via Nginx na mesma máquina.
