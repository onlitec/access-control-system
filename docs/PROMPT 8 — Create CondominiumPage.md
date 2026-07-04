You are working inside `frontend-admin/src/pages/` of the access-control-system monorepo.

Task: Create `CondominiumPage.tsx` — configuration of the condominium structure (name, towers, blocks, units).
This is master data that other panels depend on.

--- FRONTEND: CondominiumPage.tsx ---

Tab 1 — "Dados gerais"
  Form fields:
  - Nome do condomínio (text)
  - CNPJ (masked input)
  - Endereço completo (text)
  - Telefone (masked)
  - E-mail de contato
  - Logo (file upload, preview shown)
  Save button → PUT /api/condominium/settings

Tab 2 — "Torres e blocos"
  - Tree list: Torre → Bloco (collapsible)
  - "+ Adicionar torre" button → inline form: nome, número de andares
  - Each torre has "+ Adicionar bloco" sub-button
  - Edit/delete icons per item
  - Deleting a torre with units shows a confirmation warning

Tab 3 — "Unidades"
  - Filter by torre/bloco dropdowns
  - Table: Número | Torre | Bloco | Andar | Status (ocupada/vaga) | Moradores | Ações
  - "+ Nova unidade" → inline form: número, torre (select), bloco (select), andar
  - Bulk import button: "Importar via CSV" → accepts CSV with columns: numero, torre, bloco, andar
  - CSV template download link

IMPORTANT: Do not use <form> tags. Use controlled React state and onClick handlers.

--- BACKEND ---

File: `backend-api/src/routes/condominium.routes.ts` (create)
Register under `/api/condominium`
Auth: requireAdminAuth

Endpoints:
GET/PUT  /api/condominium/settings           — condominium metadata
GET/POST /api/condominium/towers             — list/create towers
PUT/DELETE /api/condominium/towers/:id       — update/delete tower
GET/POST /api/condominium/units              — list (with ?towerid= filter) / create unit
PUT/DELETE /api/condominium/units/:id        — update/delete unit
POST /api/condominium/units/import           — CSV import (use csv-parse library)

--- PRISMA MODELS ---

model CondominiumSettings {
  id        String  @id @default("singleton")
  name      String
  cnpj      String?
  address   String?
  phone     String?
  email     String?
  logoUrl   String?
  updatedAt DateTime @updatedAt
}

model Tower {
  id        String  @id @default(cuid())
  name      String
  floors    Int     @default(1)
  blocks    Block[]
  units     Unit[]
  createdAt DateTime @default(now())
}

model Block {
  id        String  @id @default(cuid())
  name      String
  towerId   String
  tower     Tower   @relation(fields: [towerId], references: [id])
  units     Unit[]
  createdAt DateTime @default(now())
}

model Unit {
  id        String  @id @default(cuid())
  number    String
  floor     Int?
  status    String  @default("vacant") // "occupied" | "vacant"
  towerId   String
  tower     Tower   @relation(fields: [towerId], references: [id])
  blockId   String?
  block     Block?  @relation(fields: [blockId], references: [id])
  createdAt DateTime @default(now())
}

Create migration: npx prisma migrate dev --name add_condominium_structure
Run builds and fix errors.