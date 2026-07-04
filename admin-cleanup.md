# Refactoring Plan: Admin Panel Cleanup

## Goal
Transform the `frontend-admin` package into a pure system-operations panel by removing all access-control related pages, routes, layout menu items, dashboard stats, API endpoints, and configuration mappings, then verify that the TypeScript build passes with zero errors.

## Tasks
- [x] Task 1: Create backup folder and back up the files to be deleted → Verify: Check files in `backups/frontend-admin-cleanup-backup/`
- [x] Task 2: Delete access-control page files from `frontend-admin/src/pages/` → Verify: Confirm files are deleted
- [x] Task 3: Edit `frontend-admin/src/App.tsx` to remove access-control routes → Verify: Verify imports and route elements are removed
- [x] Task 4: Edit `frontend-admin/src/components/AdminLayout.tsx` to remove access-control sidebar items → Verify: Verify menu items array is cleaned up
- [x] Task 5: Edit `frontend-admin/src/pages/DashboardPage.tsx` to remove access-control metric widgets → Verify: Check component renders only system health
- [x] Task 6: Edit `frontend-admin/src/pages/SettingsPage.tsx` to clean up CMS entity mappings → Verify: Remove mappings UI and related states
- [x] Task 7: Edit `frontend-admin/src/services/api.ts` to clean up unused access-control endpoints → Verify: Check compilation in API service
- [x] Task 8: Run build in `frontend-admin` and fix any TypeScript or import errors → Verify: `npm run build` passes successfully

## Done When
- [x] All 7 access-control page files are deleted
- [x] App.tsx, AdminLayout.tsx, DashboardPage.tsx, SettingsPage.tsx, and api.ts are clean of access-control logic
- [x] `npm run build` inside `frontend-admin` runs and finishes with 0 errors
