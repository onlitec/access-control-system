You are working inside the access-control-system monorepo.

Task: Final cleanup after the admin master panel refactor. 

Steps:

1. In `frontend-admin/src/App.tsx`:
   - Confirm all new routes are registered:
     /admin                → DashboardPage (existing or create minimal one)
     /admin/health         → SystemHealthPage
     /admin/containers     → PlaceholderPage title="Containers"  (health page already shows this data)
     /admin/backups        → BackupsPage
     /admin/logs           → PlaceholderPage title="Logs do sistema"
     /admin/integrations   → IntegrationsPage (existing)
     /admin/condominium    → CondominiumPage
     /admin/system-users   → SystemUsersPage
     /admin/permissions    → PlaceholderPage title="Permissões"
     /admin/audit-access   → AuditAccessPage
     /admin/audit-admin    → PlaceholderPage title="Logs administrativos"
     /admin/reports        → PlaceholderPage title="Relatórios"
   - 404 catch-all: redirect to /admin

2. Update `frontend-admin/src/pages/DashboardPage.tsx` (or create it):
   - Shows 4 summary cards linking to the main sections:
     "Sistema" (health icon + status dot) | "Backups" (last backup date) | "Usuários" (count) | "Condomínio" (name)
   - Each card is clickable, navigates to the corresponding section
   - Data from: GET /api/ops/health (for system card) + GET /api/condominium/settings (for name)

3. In `nginx.conf`:
   - Verify that `/admin` is proxied to the `access-admin` container
   - Add Content-Security-Policy header for admin routes:
     add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" always;

4. Run full build:
   cd backend-api && npm run build
   cd frontend-admin && npm run build
   
5. Run: docker compose build access-admin access-api
   Run: docker compose up -d
   Run: ./scripts/ops.sh smoke

Report: list any remaining errors and steps needed to fix them.