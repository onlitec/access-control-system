-- CreateTable
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cpf" TEXT NOT NULL,
    "hikPersonId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT NOT NULL,
    "towers" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'VISITOR',
    "label" TEXT,
    "allowVehicle" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" DATETIME NOT NULL,
    "validUntil" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "document" TEXT,
    "company" TEXT,
    "plate" TEXT,
    "visitDate" TEXT NOT NULL,
    "visitStart" DATETIME NOT NULL,
    "visitEnd" DATETIME NOT NULL,
    "faceJpeg" BLOB,
    "documentJpeg" BLOB,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "rejectReason" TEXT,
    "hikVisitorId" TEXT,
    "hikAppointRecordId" TEXT,
    "hikError" TEXT,
    "lgpdConsentAt" DATETIME NOT NULL,
    "saveConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "Visit_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "Invite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedVisitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "residentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VISITOR',
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "document" TEXT,
    "company" TEXT,
    "plate" TEXT,
    "faceJpeg" BLOB NOT NULL,
    "documentJpeg" BLOB NOT NULL,
    "consentAt" DATETIME NOT NULL,
    "lastVisitAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FamilyLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responsibleId" TEXT NOT NULL,
    "responsibleName" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "residentId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LoginCode_cpf_createdAt_idx" ON "LoginCode"("cpf", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE INDEX "Invite_residentId_createdAt_idx" ON "Invite"("residentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_inviteId_key" ON "Visit"("inviteId");

-- CreateIndex
CREATE INDEX "Visit_status_idx" ON "Visit"("status");

-- CreateIndex
CREATE INDEX "SavedVisitor_lastVisitAt_idx" ON "SavedVisitor"("lastVisitAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedVisitor_residentId_phone_key" ON "SavedVisitor"("residentId", "phone");

-- CreateIndex
CREATE INDEX "FamilyLink_memberId_idx" ON "FamilyLink"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyLink_responsibleId_memberId_key" ON "FamilyLink"("responsibleId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_residentId_idx" ON "PushSubscription"("residentId");

