-- Tratamento de eventos VCA: câmera de vídeo vinculada, popup e segundos de gravação
ALTER TABLE "video_vca_configs" ADD COLUMN "record_seconds" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "video_vca_configs" ADD COLUMN "linked_camera_id" TEXT;
ALTER TABLE "video_vca_configs" ADD COLUMN "popup_on_operator" BOOLEAN NOT NULL DEFAULT false;
