-- Configurações de infraestrutura do sistema (SMTP, atualizações).
-- Idempotente: apenas CREATE TABLE IF NOT EXISTS, nenhuma migração
-- existente é alterada (checksums de produção preservados).
CREATE TABLE IF NOT EXISTS "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "smtp_user" TEXT,
    "smtp_password" TEXT,
    "smtp_from" TEXT,
    "smtp_from_name" TEXT,
    "update_manifest_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);
