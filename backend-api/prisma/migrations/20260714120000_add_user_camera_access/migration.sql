-- Permissão de câmera por usuário (aplicada no backend).
-- Idempotente: seguro rodar em bases existentes.

-- Flag por usuário: true = todas as câmeras (padrão, retrocompatível).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "camera_access_all" BOOLEAN NOT NULL DEFAULT true;

-- Câmeras liberadas quando camera_access_all = false.
CREATE TABLE IF NOT EXISTS "user_camera_access" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_camera_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_camera_access_user_id_channel_id_key"
    ON "user_camera_access"("user_id", "channel_id");
CREATE INDEX IF NOT EXISTS "user_camera_access_user_id_idx"
    ON "user_camera_access"("user_id");

DO $$ BEGIN
    ALTER TABLE "user_camera_access"
        ADD CONSTRAINT "user_camera_access_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "user_camera_access"
        ADD CONSTRAINT "user_camera_access_channel_id_fkey"
        FOREIGN KEY ("channel_id") REFERENCES "video_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
