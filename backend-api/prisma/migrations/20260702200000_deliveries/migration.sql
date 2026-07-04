-- Módulo de Entregas
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "courier_name" TEXT,
    "company" TEXT,
    "order_ref" TEXT,
    "unit" TEXT NOT NULL,
    "resident_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'awaiting',
    "photo_url" TEXT,
    "notes" TEXT,
    "received_by_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "picked_up_at" TIMESTAMP(3),
    "picked_up_by" TEXT,
    "condominium_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deliveries_status_received_at_idx" ON "deliveries"("status", "received_at" DESC);
