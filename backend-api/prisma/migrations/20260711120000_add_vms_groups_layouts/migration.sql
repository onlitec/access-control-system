-- Videowall: pastas/grupos de câmeras na árvore lateral e mosaicos salvos
-- (quais câmeras em quais quadros), para reabrir a tela já configurada.

-- CreateTable
CREATE TABLE IF NOT EXISTS "camera_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camera_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "video_layouts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 4,
    "slots" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_layouts_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "video_channels" ADD COLUMN IF NOT EXISTS "group_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "camera_groups_name_key" ON "camera_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "video_layouts_name_key" ON "video_layouts"("name");

-- AddForeignKey (idempotente)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_channels_group_id_fkey') THEN
        ALTER TABLE "video_channels" ADD CONSTRAINT "video_channels_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "camera_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
