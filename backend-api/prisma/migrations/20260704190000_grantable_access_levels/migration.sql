-- Pools de níveis de acesso HikCentral pré-aprovados pelo admin (visitante /
-- prestador) + seleção do morador por cadastro. Idempotente.
CREATE TABLE IF NOT EXISTS "grantable_access_levels" (
    "id" TEXT NOT NULL,
    "hik_access_level_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applies_to" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grantable_access_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "grantable_access_levels_hik_access_level_id_applies_to_key"
    ON "grantable_access_levels" ("hik_access_level_id", "applies_to");

ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "selected_access_levels" JSONB;
ALTER TABLE "service_providers" ADD COLUMN IF NOT EXISTS "selected_access_levels" JSONB;
