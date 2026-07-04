-- Add per-user custom permission overrides
ALTER TABLE "users" ADD COLUMN "custom_permissions" JSONB;
