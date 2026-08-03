-- CreateTable
CREATE TABLE "session_audit_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "event_type" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "session_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_audit_events_user_id_created_at_idx" ON "session_audit_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "session_audit_events_event_type_created_at_idx" ON "session_audit_events"("event_type", "created_at");

-- AddForeignKey
ALTER TABLE "session_audit_events" ADD CONSTRAINT "session_audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
