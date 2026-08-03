-- Reconciliacao final: alinha um banco construido SOMENTE pelas migracoes
-- ao schema.prisma (fonte de verdade). O historico de migracoes estava
-- muito atras do schema (tabelas e colunas adicionadas em producao via
-- `prisma db push`). Gerada por `prisma migrate diff` e tornada IDEMPOTENTE
-- (IF NOT EXISTS / IF EXISTS / DO-block em FKs) para ser inocua em bancos
-- que ja estao em dia (producao) e completa em bancos novos (instalador).

-- DropIndex
DROP INDEX IF EXISTS "guarita_passback_alerts_person_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "guarita_passback_alerts_resolved_idx";

-- DropIndex
DROP INDEX IF EXISTS "service_providers_full_name_idx";

-- DropIndex
DROP INDEX IF EXISTS "service_providers_provider_type_idx";

-- DropIndex
DROP INDEX IF EXISTS "service_providers_service_type_idx";

-- DropIndex
DROP INDEX IF EXISTS "service_providers_tower_idx";

-- DropIndex
DROP INDEX IF EXISTS "towers_is_active_idx";

-- AlterTable
ALTER TABLE "access_areas" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "access_events" ALTER COLUMN "event_time" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "device_name" DROP NOT NULL,
ALTER COLUMN "door_name" DROP NOT NULL,
ALTER COLUMN "event_type" DROP NOT NULL,
ALTER COLUMN "event_type" SET DEFAULT 'face';

-- AlterTable
ALTER TABLE "condominium_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "has_addresses" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "doorbell_devices" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "guarita_devices" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "guarita_passback_states" ALTER COLUMN "direction" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "hikcentral_configs" ADD COLUMN IF NOT EXISTS "config_name" TEXT,
ADD COLUMN IF NOT EXISTS "created_by" TEXT,
ADD COLUMN IF NOT EXISTS "last_sync" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "sync_interval_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN IF NOT EXISTS "updated_by" TEXT;

-- AlterTable
ALTER TABLE "integration_configs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "block" TEXT,
ADD COLUMN IF NOT EXISTS "card_serial" TEXT,
ADD COLUMN IF NOT EXISTS "cpf" TEXT,
ADD COLUMN IF NOT EXISTS "document_photo_url" TEXT,
ADD COLUMN IF NOT EXISTS "is_owner" BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "parking_spaces" INTEGER,
ADD COLUMN IF NOT EXISTS "photo_url" TEXT,
ADD COLUMN IF NOT EXISTS "rg" TEXT,
ADD COLUMN IF NOT EXISTS "tower" TEXT,
ADD COLUMN IF NOT EXISTS "tx_serial" TEXT,
ADD COLUMN IF NOT EXISTS "unit_number" TEXT,
ADD COLUMN IF NOT EXISTS "vehicle_plate" TEXT,
ALTER COLUMN "updated_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "towers" ADD COLUMN IF NOT EXISTS "floors" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
ALTER COLUMN "role" SET DEFAULT 'admin_master';

-- AlterTable
ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "access_level_id" TEXT,
ADD COLUMN IF NOT EXISTS "consent_timestamp" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "document" TEXT,
ADD COLUMN IF NOT EXISTS "document_photo_url" TEXT,
ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "full_name" TEXT,
ADD COLUMN IF NOT EXISTS "invite_token" TEXT,
ADD COLUMN IF NOT EXISTS "lgpd_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "photo_url" TEXT,
ADD COLUMN IF NOT EXISTS "purpose" TEXT,
ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "surname" TEXT,
ADD COLUMN IF NOT EXISTS "tower" TEXT,
ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'VISITOR',
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "visiting_resident" TEXT,
ADD COLUMN IF NOT EXISTS "visiting_unit" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_audit_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ip_address" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "entity_mappings" (
    "id" TEXT NOT NULL,
    "page_route" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "hik_entity_id" TEXT NOT NULL,
    "hik_entity_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "filter_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "entity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "backup_runs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "size_bytes" BIGINT,
    "destination" TEXT,
    "error_message" TEXT,
    "triggered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "blocks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tower_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "units" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'vacant',
    "tower_id" TEXT NOT NULL,
    "block_id" TEXT,
    "parking_spaces" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "role_permissions" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "health" BOOLEAN NOT NULL DEFAULT false,
    "containers" BOOLEAN NOT NULL DEFAULT false,
    "backups" BOOLEAN NOT NULL DEFAULT false,
    "logs" BOOLEAN NOT NULL DEFAULT false,
    "integrations" BOOLEAN NOT NULL DEFAULT false,
    "condo" BOOLEAN NOT NULL DEFAULT false,
    "users" BOOLEAN NOT NULL DEFAULT false,
    "permissions" BOOLEAN NOT NULL DEFAULT false,
    "audit" BOOLEAN NOT NULL DEFAULT false,
    "delete_registration" BOOLEAN NOT NULL DEFAULT false,
    "edit_registration" BOOLEAN NOT NULL DEFAULT false,
    "view_only" BOOLEAN NOT NULL DEFAULT false,
    "edit_departments" BOOLEAN NOT NULL DEFAULT false,
    "manage_devices" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "registration_requirements" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "blacklist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "access_schedules" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "access_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_audit_events_created_at_idx" ON "admin_audit_events"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_audit_events_action_created_at_idx" ON "admin_audit_events"("action", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_audit_events_user_email_created_at_idx" ON "admin_audit_events"("user_email", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "entity_mappings_page_route_idx" ON "entity_mappings"("page_route");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "entity_mappings_entity_type_idx" ON "entity_mappings"("entity_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "entity_mappings_page_route_entity_type_is_active_idx" ON "entity_mappings"("page_route", "entity_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_key" ON "role_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "registration_requirements_category_field_name_key" ON "registration_requirements"("category", "field_name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "blacklist_document_key" ON "blacklist"("document");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "blocks" ADD CONSTRAINT "blocks_tower_id_fkey" FOREIGN KEY ("tower_id") REFERENCES "towers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "units" ADD CONSTRAINT "units_tower_id_fkey" FOREIGN KEY ("tower_id") REFERENCES "towers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "units" ADD CONSTRAINT "units_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

