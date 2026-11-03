-- AlterTable
ALTER TABLE "LoginCode" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'LOGIN';

-- CreateTable
CREATE TABLE "ResidentCredential" (
    "cpf" TEXT NOT NULL PRIMARY KEY,
    "hikPersonId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "passwordChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
