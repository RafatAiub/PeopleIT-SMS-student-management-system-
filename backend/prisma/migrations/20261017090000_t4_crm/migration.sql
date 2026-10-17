-- T4: Admissions CRM extras (all schools, no module switch).
-- Additive: 4 tenant-scoped tables (CrmStage, CrmTask, CrmActivity,
-- CrmContact), one enum, and nullable/defaulted columns on AdmissionEnquiry.
-- No existing column is altered. The stage seed + backfill is at the end.

-- CreateEnum
CREATE TYPE "CrmContactType" AS ENUM ('ENQUIRER', 'VOLUNTEER', 'DONOR', 'OTHER');

-- AlterTable
ALTER TABLE "AdmissionEnquiry" ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "stageChangedAt" TIMESTAMP(3),
ADD COLUMN     "stageId" TEXT,
ADD COLUMN     "wonAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CrmStage" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "order" INTEGER NOT NULL,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "status" "EnquiryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3),
    "assigneeUserId" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContact" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "type" "CrmContactType" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "organisation" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "ownerUserId" TEXT,
    "enquiryId" TEXT,
    "donorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmStage_institutionId_order_idx" ON "CrmStage"("institutionId", "order");

-- CreateIndex
CREATE INDEX "CrmTask_institutionId_assigneeUserId_done_dueAt_idx" ON "CrmTask"("institutionId", "assigneeUserId", "done", "dueAt");

-- CreateIndex
CREATE INDEX "CrmTask_enquiryId_idx" ON "CrmTask"("enquiryId");

-- CreateIndex
CREATE INDEX "CrmActivity_enquiryId_createdAt_idx" ON "CrmActivity"("enquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmActivity_institutionId_type_idx" ON "CrmActivity"("institutionId", "type");

-- CreateIndex
CREATE INDEX "CrmContact_institutionId_type_idx" ON "CrmContact"("institutionId", "type");

-- CreateIndex
CREATE INDEX "CrmContact_institutionId_phone_idx" ON "CrmContact"("institutionId", "phone");

-- CreateIndex
CREATE INDEX "CrmContact_donorId_idx" ON "CrmContact"("donorId");

-- CreateIndex
CREATE INDEX "CrmContact_enquiryId_idx" ON "CrmContact"("enquiryId");

-- CreateIndex
CREATE INDEX "AdmissionEnquiry_institutionId_stageId_idx" ON "AdmissionEnquiry"("institutionId", "stageId");

-- CreateIndex
CREATE INDEX "AdmissionEnquiry_institutionId_followUpAt_idx" ON "AdmissionEnquiry"("institutionId", "followUpAt");

-- AddForeignKey
ALTER TABLE "AdmissionEnquiry" ADD CONSTRAINT "AdmissionEnquiry_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CrmStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmStage" ADD CONSTRAINT "CrmStage_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "AdmissionEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "AdmissionEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "AdmissionEnquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (deterministic and safe to re-run)
-- 1. The six default stages for every institution that has none yet.
--    Same values as DEFAULT_STAGES in src/modules/crm/crm.logic.ts.
INSERT INTO "CrmStage" ("id", "institutionId", "name", "nameBn", "color", "order", "isWon", "isLost", "status", "createdAt", "updatedAt")
SELECT 'crmst_' || md5(i."id" || ':' || d.st), i."id", d.nm, d.nm_bn, d.col, d.ord, d.won, d.lost, d.st::"EnquiryStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Institution" i
CROSS JOIN (VALUES
    ('NEW', 'New', 'নতুন', '#3b82f6', 1, false, false),
    ('CONTACTED', 'Contacted', 'যোগাযোগ হয়েছে', '#8b5cf6', 2, false, false),
    ('VISITED', 'Visit scheduled', 'পরিদর্শন নির্ধারিত', '#f59e0b', 3, false, false),
    ('APPLIED', 'Applied', 'আবেদন করেছে', '#0ea5e9', 4, false, false),
    ('ENROLLED', 'Admitted', 'ভর্তি হয়েছে', '#16a34a', 5, true, false),
    ('LOST', 'Lost', 'হারানো', '#dc2626', 6, false, true)
) AS d(st, nm, nm_bn, col, ord, won, lost)
WHERE NOT EXISTS (SELECT 1 FROM "CrmStage" s WHERE s."institutionId" = i."id")
ON CONFLICT ("id") DO NOTHING;

-- 2. Every enquiry without a stage gets the first stage (by order) that
--    counts as its current status. Nothing is lost: status is unchanged.
UPDATE "AdmissionEnquiry" e
SET "stageId" = (
        SELECT s."id" FROM "CrmStage" s
        WHERE s."institutionId" = e."institutionId" AND s."status" = e."status"
        ORDER BY s."order" ASC, s."id" ASC
        LIMIT 1
    ),
    "stageChangedAt" = COALESCE(e."stageChangedAt", e."updatedAt")
WHERE e."stageId" IS NULL;

-- 3. Already-enrolled enquiries: best known admit date is their last update.
UPDATE "AdmissionEnquiry"
SET "wonAt" = "updatedAt"
WHERE "status" = 'ENROLLED' AND "wonAt" IS NULL;
