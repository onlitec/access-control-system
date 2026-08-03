-- Altera a tabela access_areas para adicionar suporte a hierarquia de áreas e áreas favoritas
ALTER TABLE "access_areas" ADD COLUMN IF NOT EXISTS "is_favorite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "access_areas" ADD COLUMN IF NOT EXISTS "parent_id" TEXT;

-- Adiciona a foreign key recursiva em access_areas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'access_areas_parent_id_fkey' AND table_name = 'access_areas'
    ) THEN
        ALTER TABLE "access_areas" ADD CONSTRAINT "access_areas_parent_id_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "access_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Adiciona a foreign key em network_devices apontando para access_areas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'network_devices_area_id_fkey' AND table_name = 'network_devices'
    ) THEN
        ALTER TABLE "network_devices" ADD CONSTRAINT "network_devices_area_id_fkey"
        FOREIGN KEY ("area_id") REFERENCES "access_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
