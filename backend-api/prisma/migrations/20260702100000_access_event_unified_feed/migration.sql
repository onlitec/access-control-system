-- Central de Eventos: feed unificado sobre access_events (migração aditiva)
ALTER TABLE "access_events" ADD COLUMN "direction" TEXT;
ALTER TABLE "access_events" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'access';
ALTER TABLE "access_events" ADD COLUMN "source" TEXT;
ALTER TABLE "access_events" ADD COLUMN "metadata" JSONB;

CREATE INDEX "access_events_occurred_at_idx" ON "access_events"("occurred_at" DESC);
CREATE INDEX "access_events_category_occurred_at_idx" ON "access_events"("category", "occurred_at" DESC);
