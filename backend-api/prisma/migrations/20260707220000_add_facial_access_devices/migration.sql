-- Integração com leitores/controladoras faciais Hikvision — ver
-- docs/LEITORES-FACIAIS/PLANO-INTEGRACAO-LEITORES-FACIAIS.md, seção 4.
-- Modelo: dispositivo de rede (standalone ou controladora) -> porta -> leitor,
-- mais o vínculo entre AccessArea (nível de acesso) e as portas que libera.

-- AlterTable
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "facial_access_card_no" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "facial_access_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'standalone_terminal',
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 80,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "location" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sdk_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facial_access_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "facial_access_doors" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "door_no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "actuator_type" TEXT NOT NULL DEFAULT 'door',
    "direction" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facial_access_doors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "facial_access_readers" (
    "id" TEXT NOT NULL,
    "door_id" TEXT NOT NULL,
    "reader_no" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "wiring" TEXT NOT NULL DEFAULT 'rs485',
    "bus_address" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facial_access_readers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "access_area_doors" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "door_id" TEXT NOT NULL,

    CONSTRAINT "access_area_doors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "facial_access_doors_device_id_door_no_key" ON "facial_access_doors"("device_id", "door_no");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "facial_access_readers_door_id_reader_no_key" ON "facial_access_readers"("door_id", "reader_no");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "access_area_doors_area_id_door_id_key" ON "access_area_doors"("area_id", "door_id");

-- AddForeignKey
ALTER TABLE "facial_access_doors" ADD CONSTRAINT "facial_access_doors_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "facial_access_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facial_access_readers" ADD CONSTRAINT "facial_access_readers_door_id_fkey" FOREIGN KEY ("door_id") REFERENCES "facial_access_doors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_area_doors" ADD CONSTRAINT "access_area_doors_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "access_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_area_doors" ADD CONSTRAINT "access_area_doors_door_id_fkey" FOREIGN KEY ("door_id") REFERENCES "facial_access_doors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
