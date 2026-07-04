-- Acesso remoto (WAN): URL base usada nos links de onboarding/pré-cadastro
-- enviados a moradores e visitantes. Idempotente (ADD COLUMN IF NOT EXISTS).
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "access_mode" TEXT NOT NULL DEFAULT 'ip';
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "access_url_ip" TEXT;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "access_url_domain" TEXT;
