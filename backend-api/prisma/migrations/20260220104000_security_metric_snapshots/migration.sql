-- CreateTable
CREATE TABLE "security_metric_snapshots" (
    "id" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "window_hours" INTEGER NOT NULL,
    "top_n" INTEGER NOT NULL,
    "login_attempts" INTEGER NOT NULL,
    "login_failed_attempts" INTEGER NOT NULL,
    "login_failure_rate" DOUBLE PRECISION NOT NULL,
    "top_ip_attempts" JSONB NOT NULL DEFAULT '[]',
    "top_user_attempts" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_metric_snapshots_generated_at_idx" ON "security_metric_snapshots"("generated_at");

-- CreateIndex
CREATE INDEX "security_metric_snapshots_window_hours_generated_at_idx" ON "security_metric_snapshots"("window_hours", "generated_at");
