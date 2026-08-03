-- Anti-Passagem Dupla (Anti-Passback) para integração Nice Guarita IP

-- 1. Habilitar flag na tabela de configurações do condomínio
ALTER TABLE "condominium_settings"
    ADD COLUMN IF NOT EXISTS "anti_passback_enabled" BOOLEAN NOT NULL DEFAULT false;

-- 2. Tabela de estado atual de cada morador (IN ou OUT)
CREATE TABLE "guarita_passback_states" (
    "id"          TEXT        NOT NULL,
    "person_id"   TEXT        NOT NULL,
    "serial"      TEXT        NOT NULL,
    "direction"   TEXT        NOT NULL DEFAULT 'OUT',
    "device_id"   TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guarita_passback_states_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "guarita_passback_states"
    ADD CONSTRAINT "guarita_passback_states_person_id_key" UNIQUE ("person_id");

ALTER TABLE "guarita_passback_states"
    ADD CONSTRAINT "guarita_passback_states_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Tabela de alertas pendentes de liberação manual pelo operador
CREATE TABLE "guarita_passback_alerts" (
    "id"          TEXT         NOT NULL,
    "person_id"   TEXT,
    "person_name" TEXT         NOT NULL,
    "serial"      TEXT         NOT NULL,
    "device_id"   TEXT,
    "device_name" TEXT,
    "unit"        TEXT,
    "photo_url"   TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "resolved"    BOOLEAN      NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    CONSTRAINT "guarita_passback_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guarita_passback_alerts_resolved_idx" ON "guarita_passback_alerts" ("resolved");
CREATE INDEX "guarita_passback_alerts_person_id_idx" ON "guarita_passback_alerts" ("person_id");
