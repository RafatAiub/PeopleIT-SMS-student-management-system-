-- CreateEnum
CREATE TYPE "SmsMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SmsBillingKind" AS ENUM ('SCHOOL', 'PLATFORM');

-- CreateEnum
CREATE TYPE "SmsLedgerType" AS ENUM ('PURCHASE', 'DEDUCT', 'REFUND', 'ADJUST', 'BONUS');

-- CreateEnum
CREATE TYPE "SmsSenderIdStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SmsPurchaseMethod" AS ENUM ('SSLCOMMERZ', 'BKASH', 'MANUAL');

-- CreateEnum
CREATE TYPE "SmsPurchaseStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SmsWallet" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "totalPurchased" INTEGER NOT NULL DEFAULT 0,
    "totalUsed" INTEGER NOT NULL DEFAULT 0,
    "freeMonth" TEXT,
    "freeUsed" INTEGER NOT NULL DEFAULT 0,
    "lowBalanceThreshold" INTEGER NOT NULL DEFAULT 100,
    "lowBalanceAlertedAt" TIMESTAMP(3),
    "insufficientAlertedAt" TIMESTAMP(3),
    "senderId" TEXT,
    "senderIdProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCreditLedger" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "type" "SmsLedgerType" NOT NULL,
    "units" INTEGER NOT NULL,
    "freeUnits" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "smsMessageId" TEXT,
    "purchaseId" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "to" TEXT NOT NULL,
    "body" TEXT,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "encoding" TEXT NOT NULL DEFAULT 'GSM',
    "billing" "SmsBillingKind" NOT NULL DEFAULT 'SCHOOL',
    "purpose" TEXT,
    "sourceRef" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "senderId" TEXT,
    "status" "SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "costUnits" INTEGER NOT NULL DEFAULT 0,
    "freeUnits" INTEGER NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" JSONB,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "statusCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsSenderIdRequest" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "requested" TEXT NOT NULL,
    "approvedValue" TEXT,
    "provider" TEXT,
    "status" "SmsSenderIdStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "reviewNote" TEXT,
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSenderIdRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCreditPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "units" INTEGER NOT NULL,
    "priceBdt" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsCreditPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCreditPurchase" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "packId" TEXT,
    "units" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "method" "SmsPurchaseMethod" NOT NULL,
    "status" "SmsPurchaseStatus" NOT NULL DEFAULT 'INITIATED',
    "receiptNumber" TEXT,
    "gatewayTransactionId" TEXT,
    "gatewayPaymentId" TEXT,
    "gatewayValId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "initiatedByUserId" TEXT,
    "recordedByUserId" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsCreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsWallet_institutionId_key" ON "SmsWallet"("institutionId");

-- CreateIndex
CREATE INDEX "SmsCreditLedger_institutionId_createdAt_idx" ON "SmsCreditLedger"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsCreditLedger_type_createdAt_idx" ON "SmsCreditLedger"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SmsCreditLedger_smsMessageId_idx" ON "SmsCreditLedger"("smsMessageId");

-- CreateIndex
CREATE INDEX "SmsMessage_institutionId_createdAt_idx" ON "SmsMessage"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_status_sentAt_idx" ON "SmsMessage"("status", "sentAt");

-- CreateIndex
CREATE INDEX "SmsMessage_provider_providerMessageId_idx" ON "SmsMessage"("provider", "providerMessageId");

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- CreateIndex
CREATE INDEX "SmsSenderIdRequest_status_createdAt_idx" ON "SmsSenderIdRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SmsSenderIdRequest_institutionId_createdAt_idx" ON "SmsSenderIdRequest"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsCreditPack_isActive_sortOrder_idx" ON "SmsCreditPack"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SmsCreditPurchase_receiptNumber_key" ON "SmsCreditPurchase"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SmsCreditPurchase_gatewayTransactionId_key" ON "SmsCreditPurchase"("gatewayTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsCreditPurchase_gatewayValId_key" ON "SmsCreditPurchase"("gatewayValId");

-- CreateIndex
CREATE INDEX "SmsCreditPurchase_institutionId_status_idx" ON "SmsCreditPurchase"("institutionId", "status");

-- CreateIndex
CREATE INDEX "SmsCreditPurchase_gatewayPaymentId_idx" ON "SmsCreditPurchase"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "SmsCreditPurchase_status_paidAt_idx" ON "SmsCreditPurchase"("status", "paidAt");

-- AddForeignKey
ALTER TABLE "SmsWallet" ADD CONSTRAINT "SmsWallet_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsCreditLedger" ADD CONSTRAINT "SmsCreditLedger_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSenderIdRequest" ADD CONSTRAINT "SmsSenderIdRequest_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsCreditPurchase" ADD CONSTRAINT "SmsCreditPurchase_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsCreditPurchase" ADD CONSTRAINT "SmsCreditPurchase_packId_fkey" FOREIGN KEY ("packId") REFERENCES "SmsCreditPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- P5: a wallet can never go negative, even if application code is wrong.
ALTER TABLE "SmsWallet" ADD CONSTRAINT "SmsWallet_balance_nonnegative" CHECK ("balance" >= 0);
