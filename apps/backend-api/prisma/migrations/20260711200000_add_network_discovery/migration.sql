-- Módulo de Network Discovery: dispositivos de rede descobertos automaticamente
-- ou adicionados manualmente (câmeras IP, NVRs, DVRs, leitores faciais, interfones).
-- Todos os CREATE/ALTER usam IF NOT EXISTS/IF NOT EXISTS para idempotência.

-- Categorias de dispositivo (equivalente aos itens do menu lateral do HikCentral)
CREATE TABLE IF NOT EXISTS "device_categories" (
    "id"         TEXT NOT NULL,
    "code"       TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    CONSTRAINT "device_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_categories_code_key" ON "device_categories"("code");

-- Seed das categorias padrão
INSERT INTO "device_categories" ("id", "code", "name")
VALUES
    (gen_random_uuid()::text, 'encoding',             'Dispositivo de Codificação (Câmeras/NVR)'),
    (gen_random_uuid()::text, 'access_control',       'Dispositivo de Controle de Acesso'),
    (gen_random_uuid()::text, 'facial',               'Terminal Facial / Biometria'),
    (gen_random_uuid()::text, 'intercom',             'Terminal de Interfone / Porteiro'),
    (gen_random_uuid()::text, 'network_transmission', 'Dispositivo de Transmissão de Rede')
ON CONFLICT ("code") DO NOTHING;

-- Tabela principal de dispositivos de rede
CREATE TABLE IF NOT EXISTS "network_devices" (
    "id"                           TEXT NOT NULL,
    "mac_address"                  TEXT,
    "ip_address"                   TEXT NOT NULL,
    "protocol_type"                TEXT NOT NULL,
    "manufacturer"                 TEXT,
    "model"                        TEXT,
    "serial_number"                TEXT,
    "device_type"                  TEXT,
    "firmware_version"             TEXT,
    "is_added"                     BOOLEAN NOT NULL DEFAULT false,
    "last_discovered_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Campos preenchidos após adição/promoção do discovery
    "category_id"                  TEXT,
    "area_id"                      TEXT,
    "friendly_name"                TEXT,
    "channel_count"                INTEGER NOT NULL DEFAULT 0,
    "http_port"                    INTEGER NOT NULL DEFAULT 80,
    "sdk_port"                     INTEGER NOT NULL DEFAULT 8000,
    "subnet_mask"                  TEXT,
    "gateway"                      TEXT,
    "dhcp_enabled"                 BOOLEAN NOT NULL DEFAULT false,
    "credential_username"          TEXT,
    "credential_password_encrypted" TEXT,
    "status"                       TEXT NOT NULL DEFAULT 'unknown',
    "last_sync_at"                 TIMESTAMPTZ,
    "created_at"                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"                   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "network_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "network_devices_category_id_fkey"
        FOREIGN KEY ("category_id") REFERENCES "device_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "network_devices_mac_address_key"   ON "network_devices"("mac_address") WHERE "mac_address" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "network_devices_serial_number_key" ON "network_devices"("serial_number") WHERE "serial_number" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "network_devices_ip_address_idx"           ON "network_devices"("ip_address");
CREATE INDEX IF NOT EXISTS "network_devices_is_added_idx"             ON "network_devices"("is_added");

-- Histórico de sincronizações e erros por dispositivo
CREATE TABLE IF NOT EXISTS "device_sync_logs" (
    "id"         TEXT NOT NULL,
    "device_id"  TEXT NOT NULL,
    "status"     TEXT NOT NULL,
    "message"    TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "device_sync_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_sync_logs_device_id_fkey"
        FOREIGN KEY ("device_id") REFERENCES "network_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "device_sync_logs_device_id_idx" ON "device_sync_logs"("device_id");
