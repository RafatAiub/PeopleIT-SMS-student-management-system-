-- CreateEnum
CREATE TYPE "EmailPriority" AS ENUM ('P0_SECURITY', 'P1_TRANSACTIONAL', 'P2_BULK');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('QUEUED', 'SENT', 'DEFERRED', 'SKIPPED', 'SUPPRESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailSuppressionReason" AS ENUM ('HARD_BOUNCE', 'SPAM', 'BLOCKED', 'INVALID', 'UNSUBSCRIBED', 'MANUAL');

-- CreateEnum
CREATE TYPE "EmailSuppressionScope" AS ENUM ('ALL', 'BULK');

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "scope" "EmailSuppressionScope" NOT NULL DEFAULT 'ALL',
    "reason" "EmailSuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "institutionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "template" TEXT NOT NULL,
    "priority" "EmailPriority" NOT NULL,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'QUEUED',
    "toHash" TEXT NOT NULL,
    "toMasked" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "provider" TEXT,
    "messageId" TEXT,
    "idempotencyKey" TEXT,
    "tags" TEXT[],
    "error" TEXT,
    "notBefore" TIMESTAMP(3),
    "lastEvent" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSuppression_institutionId_idx" ON "EmailSuppression"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_email_scope_key" ON "EmailSuppression"("email", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_idempotencyKey_key" ON "EmailLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EmailLog_status_notBefore_idx" ON "EmailLog"("status", "notBefore");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_institutionId_createdAt_idx" ON "EmailLog"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_messageId_idx" ON "EmailLog"("messageId");

-- CreateIndex
CREATE INDEX "EmailLog_toHash_idx" ON "EmailLog"("toHash");

