You are working inside `frontend-admin/src/pages/` of the access-control-system monorepo.

Task: Create `AuditAccessPage.tsx` — a read-only log viewer for all access events in the system.

--- FRONTEND: AuditAccessPage.tsx ---

Filter bar (top):
- Date range picker: from / to (default: last 7 days)
- Person name search input
- Type filter (select): Todos | Morador | Visitante | Prestador (condomínio) | Prestador (morador)
- Status filter: Todos | Autorizado | Negado | Pendente
- Export button: "Exportar CSV" → GET /api/audit/access/export?...same filters

Table:
Columns: Data/hora | Nome | Tipo | Unidade | Porteiro | Dispositivo | Status
- Date formatted as DD/MM/YYYY HH:mm:ss
- Status badge: Autorizado (green) | Negado (red) | Pendente (amber)
- Clicking a row expands it inline showing: foto capturada (if any), observações, provider name (if provider)

Pagination: 25 per page, total count shown

--- BACKEND ---

File: `backend-api/src/routes/audit.routes.ts` (create)
Register under `/api/audit`
Auth: requireAdminAuth

Endpoints:

GET /api/audit/access
  Query params: from, to, search, type, status, page, limit
  Source: query `access_events` table (check if it exists; if not, define model below)
  Return: { items: [...], total, page, limit }

GET /api/audit/access/export
  Same filters, no pagination
  Return: CSV file with Content-Disposition: attachment; filename="acessos-YYYY-MM-DD.csv"
  CSV columns: data_hora, nome, tipo, unidade, porteiro, dispositivo, status, observacoes

--- PRISMA MODEL (add if not exists) ---

model AccessEvent {
  id           String   @id @default(cuid())
  occurredAt   DateTime @default(now())
  personName   String
  personType   String   // "resident" | "visitor" | "provider_condo" | "provider_resident"
  personId     String?
  unit         String?  // e.g. "Torre A, Apto 102"
  operatorId   String?  // system user who registered the entry
  deviceName   String?  // videoporteiro or access controller name
  status       String   // "authorized" | "denied" | "pending"
  photoUrl     String?
  notes        String?
  createdAt    DateTime @default(now())
}

Create migration: npx prisma migrate dev --name add_access_events
Run builds and fix errors.