-- T5: Trash & restore (all schools, no module switch).
-- Additive: nullable deletedAt/deletedByUserId on the twelve trash-able tables,
-- the TrashEntityType enum and the TrashEntry table. No existing column is
-- altered and no row changes (nothing is in the trash yet).

-- CreateEnum
CREATE TYPE "TrashEntityType" AS ENUM ('STUDENT', 'GUARDIAN', 'USER', 'INVOICE', 'NOTICE', 'EVENT', 'ENQUIRY', 'SITE_PAGE', 'SITE_POST', 'DONATION_FUND', 'DONATION_CAMPAIGN', 'FAMILY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "AdmissionEnquiry" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SitePage" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SitePost" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "DonationFund" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "DonationCampaign" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT;

-- CreateTable
CREATE TABLE "TrashEntry" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "entityType" "TrashEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "deletedByUserId" TEXT,
    "deletedByName" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "purgeError" TEXT,
    "metadata" JSONB,

    CONSTRAINT "TrashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrashEntry_institutionId_deletedAt_idx" ON "TrashEntry"("institutionId", "deletedAt");

-- CreateIndex
CREATE INDEX "TrashEntry_institutionId_entityType_idx" ON "TrashEntry"("institutionId", "entityType");

-- CreateIndex
CREATE INDEX "TrashEntry_purgeAfter_idx" ON "TrashEntry"("purgeAfter");

-- CreateIndex
CREATE UNIQUE INDEX "TrashEntry_entityType_entityId_key" ON "TrashEntry"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "TrashEntry" ADD CONSTRAINT "TrashEntry_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

