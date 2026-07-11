-- Ciclo de gravação: duração de cada arquivo gerado, configurável por câmera.
-- Antes era fixo em 1 minuto (padrão do mediamtx.yml), o que gerava uma enxurrada
-- de arquivos pequenos na gravação contínua.

ALTER TABLE "video_recording_configs"
    ADD COLUMN IF NOT EXISTS "segment_minutes" INTEGER NOT NULL DEFAULT 10;
