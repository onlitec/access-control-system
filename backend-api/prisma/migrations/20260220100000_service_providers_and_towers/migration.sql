-- CreateTable
CREATE TABLE "towers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "towers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_providers" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "company_name" TEXT,
    "document" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "service_type" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL DEFAULT 'temporary',
    "photo_url" TEXT,
    "document_photo_url" TEXT,
    "tower" TEXT,
    "visiting_resident" TEXT,
    "valid_from" TEXT,
    "valid_until" TEXT,
    "authorized_units" JSONB,
    "notes" TEXT,
    "hikcentral_person_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_providers_provider_type_check" CHECK ("provider_type" IN ('fixed', 'temporary'))
);

-- CreateIndex
CREATE UNIQUE INDEX "towers_name_key" ON "towers"("name");

-- CreateIndex
CREATE INDEX "towers_is_active_idx" ON "towers"("is_active");

-- CreateIndex
CREATE INDEX "service_providers_full_name_idx" ON "service_providers"("full_name");

-- CreateIndex
CREATE INDEX "service_providers_service_type_idx" ON "service_providers"("service_type");

-- CreateIndex
CREATE INDEX "service_providers_provider_type_idx" ON "service_providers"("provider_type");

-- CreateIndex
CREATE INDEX "service_providers_tower_idx" ON "service_providers"("tower");

-- Seed default towers
INSERT INTO "towers" ("id", "name", "description", "is_active", "created_at", "updated_at")
VALUES
    ('tower-a', 'Tower A', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('tower-b', 'Tower B', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('tower-c', 'Tower C', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('block-1', 'Block 1', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('block-2', 'Block 2', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
