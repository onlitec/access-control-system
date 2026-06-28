-- Add provider abstraction columns to existing tables
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "external_id" TEXT;
ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "external_id" TEXT;

-- ResidentSession model
CREATE TABLE IF NOT EXISTS "resident_sessions" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resident_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "resident_sessions_token_key" ON "resident_sessions"("token");
CREATE INDEX IF NOT EXISTS "resident_sessions_person_id_idx" ON "resident_sessions"("person_id");
CREATE INDEX IF NOT EXISTS "resident_sessions_expires_at_idx" ON "resident_sessions"("expires_at");
ALTER TABLE "resident_sessions" ADD CONSTRAINT "resident_sessions_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IntegrationConfig model
CREATE TABLE IF NOT EXISTS "integration_configs" (
    "id" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_configs_provider_type_key" ON "integration_configs"("provider_type");

-- DoorbellDevice model (Hikvision ISAPI)
CREATE TABLE IF NOT EXISTS "doorbell_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 80,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "location" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "doorbell_devices_pkey" PRIMARY KEY ("id")
);

-- GuaritaDevice model (Nice Guarita IP)
CREATE TABLE IF NOT EXISTS "guarita_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 80,
    "location" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sdk_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guarita_devices_pkey" PRIMARY KEY ("id")
);

-- Seed default integration configs
INSERT INTO "integration_configs" ("id", "provider_type", "enabled", "config")
VALUES
    (gen_random_uuid()::text, 'hikcentral', false, '{}'),
    (gen_random_uuid()::text, 'local', true, '{}'),
    (gen_random_uuid()::text, 'nice_guarita', false, '{}')
ON CONFLICT ("provider_type") DO NOTHING;
