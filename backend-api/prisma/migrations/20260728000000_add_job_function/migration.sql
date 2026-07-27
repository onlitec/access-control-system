-- Funções (cargo) local-only + FKs em persons e service_providers.
-- Idempotente: seguro rodar em bases existentes.

CREATE TABLE IF NOT EXISTS "job_functions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_functions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "job_functions_name_key" ON "job_functions"("name");

ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "job_function_id" TEXT;
ALTER TABLE "service_providers" ADD COLUMN IF NOT EXISTS "job_function_id" TEXT;

DO $$ BEGIN
    ALTER TABLE "persons"
        ADD CONSTRAINT "persons_job_function_id_fkey"
        FOREIGN KEY ("job_function_id") REFERENCES "job_functions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "service_providers"
        ADD CONSTRAINT "service_providers_job_function_id_fkey"
        FOREIGN KEY ("job_function_id") REFERENCES "job_functions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
