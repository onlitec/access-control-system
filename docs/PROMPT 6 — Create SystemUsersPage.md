You are working inside `frontend-admin/` of the access-control-system monorepo.

Task: Create the system users management page for admin operators (not residents — those are managed in frontend-access).
These are the users who can log into the admin panel, the portaria panel, or both.

--- FRONTEND: SystemUsersPage.tsx ---

Table: list of system users
Columns: Nome | E-mail | Papel | Último acesso | Status | Ações
- Papel (role): "admin_master" | "operador_portaria" | "gestor_condominio"
- Status: active (green badge) / inactive (gray badge)
- Ações: edit button, deactivate/activate toggle, reset password button

Above table: "Novo usuário" button → opens inline form (not a modal — see no-modal rule below)
Inline form fields: Nome completo | E-mail | Papel (select) | Senha temporária (auto-generated, shown once)

Role descriptions shown as helper text:
- admin_master: acesso total ao painel administrativo
- operador_portaria: acesso ao painel da portaria (/painel)
- gestor_condominio: acesso ao admin com restrições (sem backups, sem sistema)

IMPORTANT: Do not use <form> tags. Use controlled React state and onClick handlers only.

--- BACKEND ---

File: `backend-api/src/routes/system-users.routes.ts` (create new file)
Register in `backend-api/src/index.ts` under `/api/system-users`
Auth: requireAdminAuth — only admin_master role can access

Endpoints:
GET    /api/system-users        — list all, supports ?role= filter
POST   /api/system-users        — create new system user
PUT    /api/system-users/:id    — update (name, role, status)
DELETE /api/system-users/:id    — soft delete (set status=inactive)
POST   /api/system-users/:id/reset-password — generate new temp password, return it once

--- PRISMA MODEL ---

The existing `User` model (or equivalent) may already exist for admin auth.
Check `backend-api/prisma/schema.prisma` first.
If a User model exists, add a `role` field (String, default "admin_master") and `status` field (String, default "active").
If no User model exists, create:

model SystemUser {
  id               String    @id @default(cuid())
  name             String
  email            String    @unique
  passwordHash     String
  role             String    @default("admin_master")
  status           String    @default("active")
  lastLoginAt      DateTime?
  mustChangePassword Boolean @default(true)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

Create migration: npx prisma migrate dev --name add_system_users_role
Run builds and fix errors.