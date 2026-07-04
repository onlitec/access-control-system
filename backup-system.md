# Refactoring Plan: Backup Management System

## Goal
Implement a complete database backup management system in the access control panel, including database schema updates, API endpoints for manual trigger, download, status, list, deletion, and a clean, responsive page on the frontend with demonstration mode fallback.

## Tasks
- [x] Task 1: Add `BackupRun` model to `prisma/schema.prisma` and sync database.
- [x] Task 2: Implement backups Express router endpoints inside `backend-api/src/routes/ops.routes.ts`.
- [x] Task 3: Expose helper API methods and `BackupRun` model types in `frontend-admin/src/services/api.ts`.
- [x] Task 4: Create the `BackupsPage.tsx` page component in the admin frontend package with mock mode fallback.
- [x] Task 5: Register the `/admin/backups` route in `frontend-admin/src/App.tsx`.
- [x] Task 6: Build `backend-api` and verify 0 compilation errors.
- [x] Task 7: Build `frontend-admin` and verify 0 compilation errors.

## Done When
- [x] Database model `BackupRun` exists in schema and database is fully updated.
- [x] Express routes GET/POST/DELETE for backups work correctly.
- [x] BackupsPage.tsx shows backup logs, status, download/delete actions, and manual backup trigger with polling.
- [x] Both backend and frontend builds compile with 0 errors.
