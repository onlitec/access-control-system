-- Módulo VMS: cadastro de câmeras IP/NVRs/DVRs, canais, configuração de
-- gravação, destinos de storage (local/rclone) e índice de segmentos gravados.
-- Streaming/gravação executados pelo MediaMTX; estas tabelas são a fonte de
-- verdade que o vms-service reconcilia com o media server.

-- CreateTable
CREATE TABLE IF NOT EXISTS "video_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ip_camera',
    "protocol" TEXT NOT NULL DEFAULT 'hikvision_isapi',
    "ip" TEXT NOT NULL,
    "http_port" INTEGER NOT NULL DEFAULT 80,
    "rtsp_port" INTEGER NOT NULL DEFAULT 554,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "location" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sdk_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "video_channels" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "channel_no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "stream_path" TEXT NOT NULL,
    "rtsp_url_main" TEXT,
    "rtsp_url_sub" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "video_recording_configs" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'off',
    "schedule" JSONB,
    "post_event_sec" INTEGER NOT NULL DEFAULT 30,
    "retention_days" INTEGER NOT NULL DEFAULT 7,
    "use_sub_stream" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_recording_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "storage_destinations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'rclone',
    "rclone_type" TEXT,
    "rclone_remote" TEXT,
    "remote_base_path" TEXT,
    "upload_mode" TEXT NOT NULL DEFAULT 'copy',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "recording_segments" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "file_path" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "trigger" TEXT NOT NULL DEFAULT 'continuous',
    "status" TEXT NOT NULL DEFAULT 'closed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "recording_uploads" (
    "id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "video_channels_stream_path_key" ON "video_channels"("stream_path");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "video_channels_device_id_channel_no_key" ON "video_channels"("device_id", "channel_no");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "video_recording_configs_channel_id_key" ON "video_recording_configs"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "storage_destinations_rclone_remote_key" ON "storage_destinations"("rclone_remote");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "recording_segments_file_path_key" ON "recording_segments"("file_path");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "recording_segments_channel_id_started_at_idx" ON "recording_segments"("channel_id", "started_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "recording_segments_status_idx" ON "recording_segments"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "recording_uploads_segment_id_destination_id_key" ON "recording_uploads"("segment_id", "destination_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "recording_uploads_status_idx" ON "recording_uploads"("status");

-- AddForeignKey (idempotente: só cria se ainda não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_channels_device_id_fkey') THEN
        ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "video_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_recording_configs_channel_id_fkey') THEN
        ALTER TABLE "video_recording_configs" ADD CONSTRAINT "video_recording_configs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "video_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recording_segments_channel_id_fkey') THEN
        ALTER TABLE "recording_segments" ADD CONSTRAINT "recording_segments_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "video_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recording_uploads_segment_id_fkey') THEN
        ALTER TABLE "recording_uploads" ADD CONSTRAINT "recording_uploads_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "recording_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recording_uploads_destination_id_fkey') THEN
        ALTER TABLE "recording_uploads" ADD CONSTRAINT "recording_uploads_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "storage_destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
