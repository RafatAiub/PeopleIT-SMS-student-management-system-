-- CreateEnum
CREATE TYPE "PlatformPricingModel" AS ENUM ('FLAT', 'PER_STUDENT');

-- CreateEnum
CREATE TYPE "PlatformDiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "PlatformFirstMonthMode" AS ENUM ('PRORATE', 'FREE', 'FULL');

-- CreateEnum
CREATE TYPE "PlatformAccessLevel" AS ENUM ('ACTIVE', 'RESTRICTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PlatformInvoiceStatus" AS ENUM ('DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformPaymentMethod" AS ENUM ('SSLCOMMERZ', 'BKASH', 'CASH', 'BANK_TRANSFER', 'BKASH_PERSONAL', 'NAGAD_PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PlatformPaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlatformActivityType" AS ENUM ('CALL', 'NOTE', 'PROMISE_TO_PAY', 'PAYMENT', 'ACCESS_CHANGE');

-- CreateEnum
CREATE TYPE "PlatformCallOutcome" AS ENUM ('REACHED', 'NO_ANSWER', 'PROMISED', 'REFUSED', 'WRONG_NUMBER');

-- CreateEnum
CREATE TYPE "PlatformReminderKind" AS ENUM ('UPCOMING', 'FINAL', 'OVERDUE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "PlatformReminderChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "PlatformReminderResult" AS ENUM ('SENT', 'SKIPPED', 'FAILED');

-- AlterEnum
ALTER TYPE "PaymentGateway" ADD VALUE 'BKASH';

-- CreateTable
CREATE TABLE "InstitutionBillingProfile" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pricingModel" "PlatformPricingModel" NOT NULL,
    "flatAmount" DECIMAL(12,2),
    "perStudentRate" DECIMAL(12,2),
    "minimumCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountType" "PlatformDiscountType",
    "discountValue" DECIMAL(12,2),
    "discountNote" TEXT,
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "billingStartMonth" TEXT NOT NULL,
    "serviceStartDate" DATE,
    "firstMonthMode" "PlatformFirstMonthMode" NOT NULL DEFAULT 'PRORATE',
    "freeMonths" INTEGER NOT NULL DEFAULT 0,
    "remindSms" BOOLEAN NOT NULL DEFAULT true,
    "remindEmail" BOOLEAN NOT NULL DEFAULT true,
    "smsLanguage" TEXT NOT NULL DEFAULT 'bn',
    "autoRestrictAfterDays" INTEGER,
    "billingPhone" TEXT,
    "billingEmail" TEXT,
    "accessOverride" "PlatformAccessLevel",
    "overrideReason" TEXT,
    "overrideKeep" BOOLEAN NOT NULL DEFAULT false,
    "overrideSetAt" TIMESTAMP(3),
    "overrideSetById" TEXT,
    "collectionAssigneeId" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformInvoice" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "studentCount" INTEGER,
    "pricingModel" "PlatformPricingModel" NOT NULL,
    "rate" DECIMAL(12,2),
    "lines" JSONB NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "waivedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "PlatformInvoiceStatus" NOT NULL DEFAULT 'DUE',
    "statusReason" TEXT,
    "generatedBy" TEXT NOT NULL DEFAULT 'SCHEDULER',
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3),
    "overdueAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPayment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "method" "PlatformPaymentMethod" NOT NULL,
    "status" "PlatformPaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
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

    CONSTRAINT "PlatformPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "appliedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCollectionActivity" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "type" "PlatformActivityType" NOT NULL,
    "callOutcome" "PlatformCallOutcome",
    "body" TEXT,
    "promiseDate" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "assigneeUserId" TEXT,
    "metadata" JSONB,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformCollectionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformReminderLog" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "kind" "PlatformReminderKind" NOT NULL,
    "channel" "PlatformReminderChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "result" "PlatformReminderResult" NOT NULL,
    "providerResponse" TEXT,
    "dayKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionBillingProfile_institutionId_key" ON "InstitutionBillingProfile"("institutionId");

-- CreateIndex
CREATE INDEX "InstitutionBillingProfile_isActive_idx" ON "InstitutionBillingProfile"("isActive");

-- CreateIndex
CREATE INDEX "InstitutionBillingProfile_collectionAssigneeId_idx" ON "InstitutionBillingProfile"("collectionAssigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvoice_invoiceNumber_key" ON "PlatformInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "PlatformInvoice_status_dueDate_idx" ON "PlatformInvoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "PlatformInvoice_period_idx" ON "PlatformInvoice"("period");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvoice_institutionId_period_key" ON "PlatformInvoice"("institutionId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPayment_receiptNumber_key" ON "PlatformPayment"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPayment_gatewayTransactionId_key" ON "PlatformPayment"("gatewayTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPayment_gatewayValId_key" ON "PlatformPayment"("gatewayValId");

-- CreateIndex
CREATE INDEX "PlatformPayment_institutionId_status_idx" ON "PlatformPayment"("institutionId", "status");

-- CreateIndex
CREATE INDEX "PlatformPayment_gatewayPaymentId_idx" ON "PlatformPayment"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "PlatformPayment_paidAt_idx" ON "PlatformPayment"("paidAt");

-- CreateIndex
CREATE INDEX "PlatformPaymentAllocation_invoiceId_idx" ON "PlatformPaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPaymentAllocation_paymentId_invoiceId_key" ON "PlatformPaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "PlatformCollectionActivity_institutionId_createdAt_idx" ON "PlatformCollectionActivity"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformCollectionActivity_type_idx" ON "PlatformCollectionActivity"("type");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformReminderLog_dedupeKey_key" ON "PlatformReminderLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "PlatformReminderLog_institutionId_createdAt_idx" ON "PlatformReminderLog"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformReminderLog_invoiceId_idx" ON "PlatformReminderLog"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_gatewayValId_key" ON "SubscriptionPayment"("gatewayValId");

-- AddForeignKey
ALTER TABLE "InstitutionBillingProfile" ADD CONSTRAINT "InstitutionBillingProfile_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPaymentAllocation" ADD CONSTRAINT "PlatformPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PlatformPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPaymentAllocation" ADD CONSTRAINT "PlatformPaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCollectionActivity" ADD CONSTRAINT "PlatformCollectionActivity_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCollectionActivity" ADD CONSTRAINT "PlatformCollectionActivity_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformReminderLog" ADD CONSTRAINT "PlatformReminderLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformReminderLog" ADD CONSTRAINT "PlatformReminderLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

