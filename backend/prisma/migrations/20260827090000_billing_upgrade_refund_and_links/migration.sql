-- AlterTable
ALTER TABLE "SubscriptionPayment"
  ADD COLUMN "gatewayPaymentUrl" TEXT,
  ADD COLUMN "generatedBySuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refundRefId" TEXT,
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundedByUserId" TEXT,
  ADD COLUMN "refundRawResponse" JSONB;
