-- T1: Donations, Zakat & Sadaqah (module islamic.donations).
-- Additive only: new enums and tables; no existing table is altered beyond new foreign keys pointing at Institution/User.

-- CreateEnum
CREATE TYPE "DonationFundType" AS ENUM ('ZAKAT', 'SADAQAH', 'WAQF', 'LILLAH', 'BUILDING', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DonationMethod" AS ENUM ('CASH', 'BANK', 'BKASH', 'NAGAD', 'SSLCOMMERZ', 'OTHER');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RecurringDonationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DonationFund" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "type" "DonationFundType" NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "goalAmount" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "showOnWebsite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donor" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationCampaign" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleBn" TEXT,
    "description" TEXT,
    "goalAmount" DECIMAL(12,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "coverImageUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "campaignId" TEXT,
    "donorId" TEXT,
    "recurringId" TEXT,
    "reference" TEXT NOT NULL,
    "donorName" TEXT,
    "donorPhone" TEXT,
    "donorEmail" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "method" "DonationMethod" NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "receiptNo" TEXT,
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "recordedById" TEXT,
    "siteId" TEXT,
    "gatewayTranId" TEXT,
    "gatewayPaymentId" TEXT,
    "gatewayRef" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "returnUrl" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "refundedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDonation" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "status" "RecurringDonationStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "lastPaidAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "remindEmail" BOOLEAN NOT NULL DEFAULT true,
    "remindSms" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringDonation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationDisbursement" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidTo" TEXT NOT NULL,
    "purpose" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationDisbursement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DonationFund_institutionId_active_idx" ON "DonationFund"("institutionId", "active");

-- CreateIndex
CREATE INDEX "Donor_institutionId_idx" ON "Donor"("institutionId");

-- CreateIndex
CREATE INDEX "Donor_institutionId_phone_idx" ON "Donor"("institutionId", "phone");

-- CreateIndex
CREATE INDEX "Donor_institutionId_email_idx" ON "Donor"("institutionId", "email");

-- CreateIndex
CREATE INDEX "Donor_userId_idx" ON "Donor"("userId");

-- CreateIndex
CREATE INDEX "DonationCampaign_institutionId_idx" ON "DonationCampaign"("institutionId");

-- CreateIndex
CREATE INDEX "DonationCampaign_fundId_idx" ON "DonationCampaign"("fundId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_reference_key" ON "Donation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_gatewayTranId_key" ON "Donation"("gatewayTranId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_gatewayRef_key" ON "Donation"("gatewayRef");

-- CreateIndex
CREATE INDEX "Donation_institutionId_status_paidAt_idx" ON "Donation"("institutionId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "Donation_institutionId_fundId_idx" ON "Donation"("institutionId", "fundId");

-- CreateIndex
CREATE INDEX "Donation_donorId_idx" ON "Donation"("donorId");

-- CreateIndex
CREATE INDEX "Donation_campaignId_idx" ON "Donation"("campaignId");

-- CreateIndex
CREATE INDEX "Donation_recurringId_idx" ON "Donation"("recurringId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_institutionId_receiptNo_key" ON "Donation"("institutionId", "receiptNo");

-- CreateIndex
CREATE INDEX "RecurringDonation_institutionId_status_nextDueDate_idx" ON "RecurringDonation"("institutionId", "status", "nextDueDate");

-- CreateIndex
CREATE INDEX "RecurringDonation_donorId_idx" ON "RecurringDonation"("donorId");

-- CreateIndex
CREATE INDEX "DonationDisbursement_institutionId_fundId_idx" ON "DonationDisbursement"("institutionId", "fundId");

-- CreateIndex
CREATE INDEX "DonationDisbursement_institutionId_date_idx" ON "DonationDisbursement"("institutionId", "date");

-- AddForeignKey
ALTER TABLE "DonationFund" ADD CONSTRAINT "DonationFund_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationCampaign" ADD CONSTRAINT "DonationCampaign_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationCampaign" ADD CONSTRAINT "DonationCampaign_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "DonationFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "DonationFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringDonation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDonation" ADD CONSTRAINT "RecurringDonation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDonation" ADD CONSTRAINT "RecurringDonation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDonation" ADD CONSTRAINT "RecurringDonation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "DonationFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationDisbursement" ADD CONSTRAINT "DonationDisbursement_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationDisbursement" ADD CONSTRAINT "DonationDisbursement_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "DonationFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

