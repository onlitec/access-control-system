-- Cria a tabela de configuracoes do condominio (modelo CondominiumSettings).
-- Esta tabela existia em bancos de producao (criada fora do historico de
-- migracoes, provavelmente via `prisma db push`), mas nenhuma migracao a
-- criava — o que quebrava o `migrate deploy` em bancos novos na migracao
-- seguinte (guarita_anti_passback, que faz ALTER TABLE nela).
-- CREATE TABLE IF NOT EXISTS torna a migracao inocua onde a tabela ja existe.

CREATE TABLE IF NOT EXISTS "condominium_settings" (
    "id"                    TEXT         NOT NULL DEFAULT 'singleton',
    "name"                  TEXT         NOT NULL,
    "cnpj"                  TEXT,
    "address"               TEXT,
    "phone"                 TEXT,
    "email"                 TEXT,
    "logo_url"              TEXT,
    "type"                  TEXT         NOT NULL DEFAULT 'vertical',
    "anti_passback_enabled" BOOLEAN      NOT NULL DEFAULT false,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "condominium_settings_pkey" PRIMARY KEY ("id")
);
