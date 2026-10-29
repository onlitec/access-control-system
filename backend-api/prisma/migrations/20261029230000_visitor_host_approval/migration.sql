-- Aprovação do morador: vincula o visitante ao morador que o convidou
-- e registra aprovação/recusa. Idempotente: seguro rodar em bases existentes.

ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "host_person_id" TEXT;
ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3);
ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

CREATE INDEX IF NOT EXISTS "visitors_host_person_id_idx" ON "visitors"("host_person_id");
