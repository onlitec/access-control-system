-- Fila de sincronização assíncrona com o HikCentral (push local -> HikCentral).
-- Idempotente: seguro rodar em bases existentes.

CREATE TABLE IF NOT EXISTS "hikcentral_sync_queue" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 8,
    "last_error" TEXT,
    "payload" JSONB NOT NULL,
    "hik_entity_id" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    CONSTRAINT "hikcentral_sync_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hikcentral_sync_queue_status_next_attempt_at_idx"
    ON "hikcentral_sync_queue"("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "hikcentral_sync_queue_entity_type_entity_id_idx"
    ON "hikcentral_sync_queue"("entity_type", "entity_id");

-- Status de sincronização visível diretamente no registro do prestador
-- (evita precisar dar join na fila só para mostrar um badge na UI).
ALTER TABLE "service_providers" ADD COLUMN IF NOT EXISTS "hik_sync_status" TEXT DEFAULT 'pending';
ALTER TABLE "service_providers" ADD COLUMN IF NOT EXISTS "hik_sync_error" TEXT;
