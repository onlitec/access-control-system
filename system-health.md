# Refactoring Plan: System Health Monitoring

## Goal
Implement system health monitoring in the access control panel by adding backend routes (`/api/ops/health`, `/api/ops/containers`), enabling Docker access for the API container, creating `SystemHealthPage.tsx` with fallback demonstration data on the frontend, and verifying successful builds.

## Tasks
- [x] Task 1: Enable Docker socket in `docker-compose.yml` and check `backend-api/Dockerfile` for permission setup.
- [x] Task 2: Create the backend `/api/ops/containers` and `/api/ops/health` routes in `backend-api/src/routes/ops.routes.ts`.
- [x] Task 3: Register `/api/ops` routes in `backend-api/src/index.ts`.
- [x] Task 4: Create the frontend `SystemHealthPage.tsx` page under `frontend-admin/src/pages/` with mock mode fallback.
- [x] Task 5: Update the routing for `/admin/health` in `frontend-admin/src/App.tsx`.
- [x] Task 6: Build `backend-api` and fix any compiler errors.
- [x] Task 7: Build `frontend-admin` and fix any compiler errors.

## Done When
- [x] Backend routes `/api/ops/health` and `/api/ops/containers` work properly.
- [x] `SystemHealthPage.tsx` shows system logs/health metrics and falls back gracefully to demo mode.
- [x] Both frontend and backend builds compile with 0 errors.
