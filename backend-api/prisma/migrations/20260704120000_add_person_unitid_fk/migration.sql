-- AddColumn: Add unitId FK to Person (nullable during migration)
ALTER TABLE "persons" ADD COLUMN "unit_id" TEXT;

-- AddForeignKey: Person.unitId -> Unit.id with SET NULL on delete
ALTER TABLE "persons" ADD CONSTRAINT "persons_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: For fast lookups and joins on Person.unitId
CREATE INDEX "persons_unit_id_idx" ON "persons"("unit_id");

-- Note: Old fields (tower, block, unit_number) kept during migration period for backward compat
-- Migration backfill will populate unitId by matching tower+block+unit_number to Unit records
-- After 2 release cycles, drop old fields via separate migration
