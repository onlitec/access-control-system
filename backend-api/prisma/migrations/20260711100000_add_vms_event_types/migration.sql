-- Gravação por evento (VMS): permite escolher quais eventos ISAPI disparam a
-- gravação (movimento/VMD, cruzamento de linha, intrusão e demais eventos VCA).
-- NULL = comportamento anterior (somente movimento/VMD).

-- AlterTable
ALTER TABLE "video_recording_configs" ADD COLUMN IF NOT EXISTS "event_types" JSONB;
