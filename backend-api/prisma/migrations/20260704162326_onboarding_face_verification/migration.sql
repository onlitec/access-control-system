-- AlterTable
ALTER TABLE "system_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "onboarding_face_verifications" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_selfie',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_selfie_url" TEXT,
    "last_similarity" DOUBLE PRECISION,
    "last_attempt_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_face_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_face_verifications_person_id_key" ON "onboarding_face_verifications"("person_id");

-- CreateIndex
CREATE INDEX "onboarding_face_verifications_status_idx" ON "onboarding_face_verifications"("status");

-- AddForeignKey
ALTER TABLE "onboarding_face_verifications" ADD CONSTRAINT "onboarding_face_verifications_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: aposenta moradores que já têm senha configurada (fluxo antigo, sem
-- verificação facial) como "approved", para o novo gate de login não trancar
-- ninguém que já usa o portal.
INSERT INTO onboarding_face_verifications (id, person_id, status, attempts, created_at, updated_at)
SELECT gen_random_uuid()::text, id, 'approved', 0, now(), now()
FROM persons
WHERE portal_password IS NOT NULL;
