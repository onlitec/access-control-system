-- Add indexes to improve session audit filtering, retention pruning and metrics aggregation
CREATE INDEX "session_audit_events_created_at_idx" ON "session_audit_events"("created_at");
CREATE INDEX "session_audit_events_ip_address_created_at_idx" ON "session_audit_events"("ip_address", "created_at");
CREATE INDEX "session_audit_events_user_email_created_at_idx" ON "session_audit_events"("user_email", "created_at");
