-- VCA por software (análise no servidor): config por canal
CREATE TABLE "video_vca_configs" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "classes" JSONB,
    "max_fps" INTEGER NOT NULL DEFAULT 5,
    "min_score" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "cooldown_sec" INTEGER NOT NULL DEFAULT 15,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "video_vca_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_vca_configs_channel_id_key" ON "video_vca_configs"("channel_id");

ALTER TABLE "video_vca_configs" ADD CONSTRAINT "video_vca_configs_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "video_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
