-- Reconcilia colunas de access_events que existem no schema.prisma (modelo
-- AccessEvent) mas nunca foram criadas por migracao — foram adicionadas em
-- producao fora do historico (via `prisma db push`). Sem elas, a migracao
-- seguinte (access_event_unified_feed) falha ao indexar "occurred_at" num
-- banco novo. IF NOT EXISTS torna tudo inocuo onde as colunas ja existem.
-- Obs.: direction/category/source/metadata NAO entram aqui — sao criadas
-- pela propria access_event_unified_feed (com ADD COLUMN sem IF NOT EXISTS).

ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "occurred_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "person_type"  TEXT NOT NULL DEFAULT 'visitor';
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "person_id"    TEXT;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "unit"         TEXT;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "operator_id"  TEXT;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "status"       TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "photo_url"    TEXT;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "notes"        TEXT;
