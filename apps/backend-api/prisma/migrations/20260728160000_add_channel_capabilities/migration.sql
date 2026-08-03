-- Capacidades manuais por canal (PTZ / ouvir microfone / falar) — toggle do admin.
ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "capabilities" JSONB;
