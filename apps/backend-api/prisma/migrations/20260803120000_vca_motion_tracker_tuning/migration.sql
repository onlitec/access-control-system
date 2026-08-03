-- VCA: parâmetros de motion gate e tracker configuráveis por câmera (opcionais;
-- NULL mantém os defaults atuais do código — nenhuma câmera muda de comportamento
-- até que o admin configure explicitamente).
ALTER TABLE "video_vca_configs" ADD COLUMN IF NOT EXISTS "motion_min_ratio" DOUBLE PRECISION;
ALTER TABLE "video_vca_configs" ADD COLUMN IF NOT EXISTS "motion_pixel_thr" INTEGER;
ALTER TABLE "video_vca_configs" ADD COLUMN IF NOT EXISTS "motion_downsample" INTEGER;
ALTER TABLE "video_vca_configs" ADD COLUMN IF NOT EXISTS "tracker_max_dist" DOUBLE PRECISION;
ALTER TABLE "video_vca_configs" ADD COLUMN IF NOT EXISTS "tracker_ttl_ms" INTEGER;
