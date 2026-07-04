-- Add visiting_block to visitors (Visitor model)
ALTER TABLE "visitors" ADD COLUMN IF NOT EXISTS "visiting_block" TEXT;

-- Add visiting_unit and visiting_block to service_providers
ALTER TABLE "service_providers" ADD COLUMN IF NOT EXISTS "visiting_unit" TEXT;
ALTER TABLE "service_providers" ADD COLUMN IF NOT EXISTS "visiting_block" TEXT;
