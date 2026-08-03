-- VCA: som de alarme configurável por canal (biblioteca embutida no frontend).
ALTER TABLE "video_vca_configs" ADD COLUMN IF NOT EXISTS "sound_id" TEXT NOT NULL DEFAULT 'beep';
