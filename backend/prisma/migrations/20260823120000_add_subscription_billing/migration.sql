-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'GRACE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('SSLCOMMERZ');

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "studentCap" INTEGER,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "planPriceId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "billingCycle" "BillingCycle" NOT NULL,
    "gateway" "PaymentGateway" NOT NULL DEFAULT 'SSLCOMMERZ',
    "gatewayTransactionId" TEXT,
    "gatewayValId" TEXT,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "initiatedByUserId" TEXT,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overriddenByUserId" TEXT,
    "rawGatewayResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "Plan_isArchived_idx" ON "Plan"("isArchived");

-- CreateIndex
CREATE INDEX "PlanPrice_planId_idx" ON "PlanPrice"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_institutionId_key" ON "Subscription"("institutionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Subscription_graceEndsAt_idx" ON "Subscription"("graceEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_gatewayTransactionId_key" ON "SubscriptionPayment"("gatewayTransactionId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_institutionId_idx" ON "SubscriptionPayment"("institutionId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_subscriptionId_idx" ON "SubscriptionPayment"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_status_idx" ON "SubscriptionPayment"("status");

-- AddForeignKey
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: seed a "legacy" unlimited plan and grandfather existing active institutions
-- with a 90-day ACTIVE subscription so the new expiry-enforcement job never suspends
-- an existing school on deploy day. New institutions go through TRIALING via
-- provisionInstitutionAndAdmin instead.
INSERT INTO "Plan" ("id", "name", "slug", "studentCap", "description", "isArchived", "displayOrder", "createdAt", "updatedAt")
VALUES ('legacy-plan', 'Legacy (Pre-Billing)', 'legacy', NULL, 'Grandfathered plan assigned to institutions that existed before subscription billing was introduced.', false, -1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "PlanPrice" ("id", "planId", "billingCycle", "amount", "currency", "isActive", "createdAt")
VALUES ('legacy-price-yearly', 'legacy-plan', 'YEARLY', 0, 'BDT', true, CURRENT_TIMESTAMP);

INSERT INTO "Subscription" ("id", "institutionId", "planId", "billingCycle", "status", "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
SELECT 'legacy-sub-' || i."id", i."id", 'legacy-plan', 'YEARLY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '90 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Institution" i
WHERE i."isActive" = true;
